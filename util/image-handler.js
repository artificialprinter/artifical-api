import Jimp from 'jimp';
import sharp from 'sharp';

const HOST = process.env.CYCLIC_URL || 'localhost';

const CROP_URL_PREFIX = 'crop';

const round = (n, decimals = 0) => Number(`${Math.round(`${n}e${decimals}`)}e-${decimals}`);

export async function upscaleImage(img, name, requestId) {
  const label = 'upscaling process' + name.slice(-5);
  console.time(label);
  const response = await fetch('https://api.replicate.com/v1/predictions', {
    method: 'POST',
    headers: {
      Authorization: `Token ${process.env.REPLICATE_API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      version: process.env.REPLICATE_SCALE_VERSION,
      input: {
          name,
          requestId,
          image: img,
          scale: 3,
          // face_enhance: true
      },
      webhook_completed: `${HOST}/webhook-scale`
    }),
  });

  console.timeLog(label, 'response');
  if (response.status !== 201) {
    let error = await response.json();

    console.log('There is an error in resize image funciton:', error);
    console.timeEnd(label);
    
    return error;
  }

  const json = await response.json();

  console.timeEnd(label);

  return json;
}

const getRndKey = () => Math.random().toString(36).slice(2);

export async function cropImageJimp(src, id) {
  const label = 'cropImageJimp_' + id;

  console.time(label);

  const srcImage = await Jimp.read(src);
  console.timeLog(label, 'read');

  const newWidth = srcImage.bitmap.width / 1.12;
  const offset = (srcImage.bitmap.width - newWidth) / 2;

  const croppedImageBuffer = await srcImage
    .crop(offset, 0, newWidth, srcImage.bitmap.height)
    // .resize(srcImage.bitmap.width / 1.12, srcImage.bitmap.height, Jimp.RESIZE_BILINEAR)
    .getBufferAsync(Jimp.MIME_PNG);

  const name = `${CROP_URL_PREFIX}-${id}.png`;
  console.timeEnd(label);

  return {
    name,
    url: `${HOST}/images/${name}`,
    buffer: croppedImageBuffer,
    lib: 'Jimp'
  };
}


export async function loadImageFromUrl(imgUrl) {
  const res = await fetch(imgUrl);
  const chunks = [];
  for await (const chunk of res.body) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

export async function cropImageSharp(imgBuffer, id) {
  const label = 'cropImageSharp_' + id;
  console.time(label);
  const sharpImg = sharp(imgBuffer);
  console.timeLog(label, 'buffer loaded');
  const sharpImgMeta = await sharpImg.metadata();
  console.timeLog(label, 'meta');

  const croppedImageBuffer = await sharpImg
    .resize(round(sharpImgMeta.width / 1.12), sharpImgMeta.height)
    .toBuffer(); /** RESULT WITH T-SHIRT */

  const name = `${CROP_URL_PREFIX}-${id}.png`;
  console.timeEnd(label);

  return {
    name,
    url: `${HOST}/images/${name}`,
    buffer: croppedImageBuffer,
    lib: 'Sharp'
  };
}
