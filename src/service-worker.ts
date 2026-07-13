import { AnkiConnect } from './anki';
import { DeepLConnect } from './translate';

const ankiConnect = new AnkiConnect("http://localhost:8765")
const deeplConnect = new DeepLConnect();

const DEFAULT_CONFIG: OCRConfig = {
    vocabURL: chrome.runtime.getURL('vocab.txt'),
    detectorModelURL: chrome.runtime.getURL('comictextdetector.pt.onnx'),
    encoderModelURL: chrome.runtime.getURL('encoder_model.onnx'),
    decoderModelURL: chrome.runtime.getURL('decoder_model.onnx'),
    startupSampleURL: chrome.runtime.getURL('sample.csv'),
    startupSampleExpectation: "いつも何かに追われていて",
    skipStartupSample: true
};

//In case the service worker has inactivated due to inactivty, check to see what it last was
let activeTabs = [];
let disabledTabs = [];
const sessionState = await chrome.storage.session.get(["activeTabs", "disabledTabs"]);

async function getDeepLApiKey(): Promise<string> {
    const settings = await chrome.storage.local.get(['deeplApiKey']);
    return (settings.deeplApiKey as string) || '';
}

async function triggerCaptureInTab(tabId: number) {
    if (!tabId) {
        return;
    }

    try {
        await chrome.tabs.sendMessage(tabId, { type: 'ActivateCapture' } as ActivateCaptureRequest);
    } catch (error) {
        console.warn('Could not activate capture in tab', tabId, error);
    }
}

chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.removeAll(() => {
        chrome.contextMenus.create({
            id: 'manga-ocr-capture',
            title: 'OCR & Translate selection',
            contexts: ['page', 'image']
        });
    });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === 'manga-ocr-capture' && tab?.id) {
        void triggerCaptureInTab(tab.id);
    }
});

chrome.commands.onCommand.addListener((command, tab) => {
    if (command === 'activate-capture' && tab?.id) {
        void triggerCaptureInTab(tab.id);
    }
});
if (sessionState.activeTabs) {
    activeTabs = sessionState.activeTabs;
}
if (sessionState.disabledTabs) {
    disabledTabs = sessionState.disabledTabs;
}

chrome.action.onClicked.addListener(function (tab) {
    const tabId = tab.id;
    if (!tab.url.includes('chrome://')) {
        toggleTab(tabId);
    }
});

function toggleTab(tabId: number) {
    if (disabledTabs.indexOf(tabId) >= 0) {
        //Un-disable message
        const message = { type: 'EnableOCR' } as EnableOCRRequest;
        chrome.tabs.sendMessage(tabId, message).then(() => {
            disabledTabs.splice(disabledTabs.indexOf(tabId), 1);
            activeTabs.push(tabId);
            chrome.storage.session.set({ activeTabs, disabledTabs });
        }, err => { 
            disabledTabs.splice(disabledTabs.indexOf(tabId), 1);
            toggleTab(tabId);
        });
    } else if (activeTabs.indexOf(tabId) >= 0) {
        //Disable script message
        const message = { type: 'DisableOCR' } as DisableOCRRequest;
        chrome.tabs.sendMessage(tabId, message).then(() => {
            activeTabs.splice(disabledTabs.indexOf(tabId), 1);
            disabledTabs.push(tabId);
            chrome.storage.session.set({ activeTabs, disabledTabs });
        }, err => {
            activeTabs.splice(disabledTabs.indexOf(tabId), 1);
            toggleTab(tabId);
        });
    } else if (activeTabs.indexOf(tabId) === -1) {
        chrome.scripting.executeScript({
            target: { tabId },
            files: ['content-script.js']
        });
        chrome.scripting.insertCSS({
            target: { tabId },
            files: ['style.css']
        });
        activeTabs.push(tabId);
        chrome.storage.session.set({ activeTabs });
    }
}

async function initializeOffscreen(): Promise<string> {
    await chrome.offscreen.createDocument({
        url: 'offscreen.html',
        reasons: [chrome.offscreen.Reason.USER_MEDIA],
        justification: 'Background processing of OCR requests'
    })

    //Send initialization request
    const request: Message = {
        type: 'InitializeOCR',
        payload: DEFAULT_CONFIG
    };
    const result = await chrome.runtime.sendMessage(request);
    return result;
}


chrome.runtime.onMessage.addListener(
    async function (request, sender) {
        console.debug("Received message in service-worker from: ", sender, request);
        const message = request as Message;
        if (message.type === 'OCRStart') {
            //A user has selected a region on the screen to perform OCR on
            const imagePoints = message.payload as CropArea;
            const image = await chrome.tabs.captureVisibleTab(sender.tab.windowId, {
                format: 'png'
            });

            //@ts-ignore chrome types out of date 
            const existingContexts = await chrome.runtime.getContexts({});
            const offscreenDocument = existingContexts.find(c => c.contextType === 'OFFSCREEN_DOCUMENT');

            if (!offscreenDocument) {
                const result = await initializeOffscreen();
                if (result === "NOT OK") {
                    console.warn("OCR model may have failed to load, check logs for further details");
                }
            }

            const request: Message = {
                type: 'ProcessBackend',
                payload: {
                    image: image,
                    tabId: sender.tab.id,
                    points: imagePoints
                }
            }
            chrome.runtime.sendMessage(request);
        } else if (message.type === 'OCRComplete') {
            //This request must be forwarded to the tab, since the offscreen worker does not have access to that resource
            const payload = message.payload as BackendResponse;
            const tabId = payload.tabId;
            chrome.tabs.sendMessage(tabId, message);
        } else if (message.type === 'TranslationRequest') {
            console.log("attempting to query DeepL for translation");
            const messages = message.payload.messages as string[];
            const apiKey = await getDeepLApiKey();
            let result: string[] = [];
            let failed = false;
            try {
                result = await deeplConnect.translate(messages, apiKey)
            } catch (e) {
                console.error("Error communicating with DeepL:", e)
                failed = true
            }
            
            const response: TranslationResponse = {
                type: 'TranslationResponse',
                payload: {
                    messages: result.length > 0 ? result : messages
                },
                error: failed
            }
            chrome.tabs.sendMessage(sender.tab.id, response);
        } else if (message.type === 'AnkiNewCardRequest') {
            const request = message as AnkiNewCardRequest
            ankiConnect.sendCard(request.payload)
        } else if (message.type === 'AnkiDeckNamesRequest') {
            const response: AnkiDeckNamesResponse = {
                type: 'AnkiDeckNamesResponse',
                payload: {
                    names: [],
                    error: null
                }
            }
            try{
                response.payload.names = await ankiConnect.deckNames()   
            } catch (error) {
                response.payload.error = error
            }
            chrome.tabs.sendMessage(sender.tab.id, response);
        } else if (message.type === 'VocabRequest') {
            const text = message.payload.text
            const response: SingleResponse = {
                type: 'VocabResponse',
                payload: {
                    result: text,
                    index: message.payload.index
                }
            }
            chrome.tabs.sendMessage(sender.tab.id, response);
        } else if (message.type === 'TranslateOneRequest') {
            const text = message.payload.text
            const apiKey = await getDeepLApiKey();
            const result = (await deeplConnect.translate([text], apiKey))[0] || text;
            const response: SingleResponse = {
                type: 'TranslateOneResponse',
                payload: {
                    result,
                    index: message.payload.index
                }
            }
            chrome.tabs.sendMessage(sender.tab.id, response);
        } else if (message.type === 'SettingsSave') {
            const payload = message.payload as any;
            if (payload.deepLApiKey !== undefined) {
                await chrome.storage.local.set({ deeplApiKey: payload.deepLApiKey });
            }
            if (payload.displayMode !== undefined) {
                await chrome.storage.local.set({ displayMode: payload.displayMode });
            }
        } else if (message.type === 'SettingsGet') {
            const settings = await chrome.storage.local.get(['deeplApiKey', 'displayMode']);
            const response: SettingsGetResponse = {
                type: 'SettingsGetResponse',
                payload: {
                    deepLApiKey: (settings.deeplApiKey as string) || '',
                    displayMode: (settings.displayMode as 'overlay' | 'sidepanel') || 'overlay'
                }
            };
            chrome.tabs.sendMessage(sender.tab.id, response);
        }
    }
)