import Jimp from 'jimp';
import sharp from 'sharp';
import { write } from './filestorage.js';

const HOST = process.env.CYCLIC_URL || 'localhost';

const TSHIRT_URL_PREFIX = 't-shirt';
const CROP_URL_PREFIX = 'crop';

const round = (n, decimals = 0) => Number(`${Math.round(`${n}e${decimals}`)}e-${decimals}`);

export async function upscaleImage(img) {
  const label = 'upscaling process' + img.slice(-5);
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

// deprecated
export async function combineTShirtImage(imgUrl, id) {
  const srcImage = await Jimp.read(imgUrl);
  const srcImageToCrop = srcImage.clone();
  const { width, height } = tShirtMockup.bitmap;
  const uniqueNumber = `${getRndKey()}-${id}`;

  const cropppedImage = srcImageToCrop.resize(srcImageToCrop.bitmap.width / 1.12, srcImage.bitmap.height, Jimp.RESIZE_BILINEAR);
  const resizedSrc = srcImage.resize(srcImage.bitmap.width / 1.4, Jimp.AUTO, Jimp.RESIZE_BILINEAR);
  const composeImageTShirt = tShirtMockup.composite(resizedSrc, (width - resizedSrc.bitmap.width) / 2, height / 4.1);
  
  /** GET IMAGES BUFFERS: */
  const tShirtResultBuffer = composeImageTShirt.getBufferAsync(Jimp.MIME_PNG); /** RESULT WITH T-SHIRT */
  const cropResultBuffer = cropppedImage.getBufferAsync(Jimp.MIME_PNG); /** RESULT WITH T-SHIRT */

  write(`${TSHIRT_URL_PREFIX}-${uniqueNumber}.png`, tShirtResultBuffer);
  write(`${CROP_URL_PREFIX}-${uniqueNumber}.png`, cropResultBuffer);

  return {
      croppedImg: `${HOST}/images/${CROP_URL_PREFIX}-${uniqueNumber}.png`,
      tShirtResult: `${HOST}/images/${TSHIRT_URL_PREFIX}-${uniqueNumber}.png`,
  };
}

// use faster sharp lib, aslo deprecated. better to use separate functions
export async function combineTShirtImageV2(imgUrl, id) {
  const res = await fetch(imgUrl);
  const chunks = [];
  for await (const chunk of res.body) {
    chunks.push(chunk);
  }
  const srcImage = await sharp(Buffer.concat(chunks));
  const srcImageToCrop = srcImage.clone();
  const { width, height } = tShirtMockupMetadata;
  const srcImageMeta = await srcImage.metadata();
  const uniqueNumber = `${Math.random().toString(36).slice(2)}-${id}`;

  const resizedWidth = round(srcImageMeta.width / 1.4);
  const cropppedImage = srcImageToCrop.resize(round(srcImageMeta.width / 1.12), srcImageMeta.height);
  const resizedSrc = await srcImage.resize(resizedWidth).toBuffer();
  const composeImageTShirt = tShirtMockupSharp.composite([
    {
      input: resizedSrc,
      left: round((width - resizedWidth) / 2),
      top: round(height / 4.1)
    }
  ]);

  /** GET IMAGES BUFFERS: */
  const tShirtResultBuffer = await composeImageTShirt.toBuffer(); /** RESULT WITH T-SHIRT */
  const cropResultBuffer = await cropppedImage.toBuffer(); /** RESULT WITH T-SHIRT */

  write(`${TSHIRT_URL_PREFIX}-${uniqueNumber}.png`, tShirtResultBuffer);
  write(`${CROP_URL_PREFIX}-${uniqueNumber}.png`, cropResultBuffer);

  return {
    croppedImg: `${HOST}/images/${CROP_URL_PREFIX}-${uniqueNumber}.png`,
    tShirtResult: `${HOST}/images/${TSHIRT_URL_PREFIX}-${uniqueNumber}.png`,
  };
}


export async function cropImageJimp(imgUrl, id) {
  const srcImage = await Jimp.read(imgUrl);
  const uniqueNumber = `${getRndKey()}-${id}`;
  const croppedImageBuffer = srcImage
    .resize(srcImage.bitmap.width / 1.12, srcImage.bitmap.height, Jimp.RESIZE_BILINEAR)
    .getBufferAsync(Jimp.MIME_PNG);

  const name = `${CROP_URL_PREFIX}-${uniqueNumber}.png`;

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
  return sharp(Buffer.concat(chunks));
}

export async function cropImageSharp(sharpImg, id) {
  const sharpImgMeta = await sharpImg.metadata();
  const uniqueNumber = `${getRndKey()}-${id}`;

  const croppedImageBuffer = await sharpImg
    .resize(round(sharpImgMeta.width / 1.12), sharpImgMeta.height)
    .toBuffer(); /** RESULT WITH T-SHIRT */

  const name = `${CROP_URL_PREFIX}-${uniqueNumber}.png`;

  return {
    name,
    url: `${HOST}/images/${name}`,
    buffer: croppedImageBuffer,
    lib: 'Sharp'
  };
}
