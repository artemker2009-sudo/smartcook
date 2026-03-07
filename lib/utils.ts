export const DEVELOPER_ID = "68ff3d0a-2a09-4e22-b39b-3fea14de3f96";

export const scaleAmount = (amount: string, multiplier: number) => {
  if (!amount) return "";
  if (multiplier === 1) return amount;
  return amount.replace(/(\d+\/\d+|\d+([\.,]\d+)?)/g, (match) => {
    let num = 0;
    if (match.includes('/')) {
      const parts = match.split('/');
      num = parseInt(parts[0]) / parseInt(parts[1]);
    } else {
      num = parseFloat(match.replace(',', '.'));
    }
    if (isNaN(num)) return match;
    const scaled = num * multiplier;
    return Number.isInteger(scaled) ? String(scaled) : scaled.toFixed(1).replace('.', ',');
  });
};

export const formatCooks = (num: number) => {
  const last = num % 10;
  const last100 = num % 100;
  if (last100 >= 11 && last100 <= 14) return `${num} куков`;
  if (last === 1) return `${num} кук`;
  if (last >= 2 && last <= 4) return `${num} кука`;
  return `${num} куков`;
};

export const cleanText = (text: any) => {
  if (!text) return "";
  return String(text).replace(/^(Шаг \d+|Step \d+|\d+[\.\)])[:\s]*/i, '').trim();
};

export const formatTime = (t: string) => {
  if (!t) return "";
  const digits = t.replace(/\D/g, '');
  return digits ? `${digits} мин.` : t;
};

export const formatCalories = (c?: string) => {
  if (!c) return "";
  const match = c.match(/\d+/);
  return match ? `${match[0]} ккал` : "";
};

export const createImage = (url: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener('load', () => resolve(image));
    image.addEventListener('error', (error) => reject(error));
    image.setAttribute('crossOrigin', 'anonymous');
    image.src = url;
  });

export async function getCroppedImg(imageSrc: string, pixelCrop: any): Promise<File | null> {
  const image = await createImage(imageSrc);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  canvas.width = pixelCrop.width;
  canvas.height = pixelCrop.height;
  ctx.drawImage(image, pixelCrop.x, pixelCrop.y, pixelCrop.width, pixelCrop.height, 0, 0, pixelCrop.width, pixelCrop.height);
  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      if (!blob) return resolve(null);
      resolve(new File([blob], `avatar_${Date.now()}.jpg`, { type: 'image/jpeg' }));
    }, 'image/jpeg');
  });
}
