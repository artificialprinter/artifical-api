import Jimp from 'jimp';
import sharp from 'sharp';
import { write } from './filestorage.js';

const HOST = process.env.CYCLIC_URL || 'localhost';

const tShirtMockupPath = './public/t-shirt-mockup.png';
const tShirtMockup = await Jimp.read(tShirtMockupPath);
const tShirtMockupSharp = await sharp(tShirtMockupPath);
const tShirtMockupMetadata = await tShirtMockupSharp.metadata();
const TSHIRT_URL_PREFIX = 't-shirt-image';
const CROP_URL_PREFIX = 'crop-image';

const round = (n, decimals = 0) => Number(`${Math.round(`${n}e${decimals}`)}e-${decimals}`);

async function resizeImage(img) {
  const label = 'resizeImage' + img.slice(-5);
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

  console.timeLog(label);
  if (response.status !== 201) {
    let error = await response.json();

    console.log('There is an error in resize image funciton:', error);

    return error;
  }


  const json = await response.json();

  console.timeEnd(label);

  return json;
}

async function combineTShirtImage(imgUrl, id) {
  const srcImage = await Jimp.read(imgUrl);
  const srcImageToCrop = srcImage.clone();
  const { width, height } = tShirtMockup.bitmap;
  const uniqueNumber = `${Math.random().toString(36).slice(2)}-${id}`;

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

// use faster sharp lib
async function combineTShirtImageV2(imgUrl, id) {
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

export {
  combineTShirtImage,
  combineTShirtImageV2,
  resizeImage
};
