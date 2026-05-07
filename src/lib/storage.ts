
export const getStorage = async (key: string): Promise<string | null> => {
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    return new Promise((resolve) => {
      chrome.storage.local.get([key], (result) => {
        resolve((result[key] as string) || null);
      });
    });
  }
  return localStorage.getItem(key);
};

export const setStorage = async (key: string, value: string): Promise<void> => {
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    return new Promise((resolve) => {
      chrome.storage.local.set({ [key]: value }, () => {
        resolve();
      });
    });
  }
  localStorage.setItem(key, value);
};
