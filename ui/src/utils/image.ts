export function loadImage(url: string) {
    return new Promise<HTMLImageElement>(function (resolve, reject) {
        const img = new Image();
        let timeoutId = setTimeout(() => {
            img.src = '';
            reject(new Error('Image load timeout'));
        }, 15000);
        img.onload = function () {
            clearTimeout(timeoutId);
            resolve(img);
        };
        img.onabort = img.onerror = (e) => {
            clearTimeout(timeoutId);
            reject(e);
        };
        img.crossOrigin = 'anonymous';
        img.src = url;
    });
}