import Jimp from 'jimp';
import sharp from 'sharp';

import TimeLogger from './time-logger.js';
const tShirtMockupPath = './public/t-shirt-mockup.png';


const tShirtMockupJimp = await Jimp.read(tShirtMockupPath);
const tShirtMockupSharp = await sharp(tShirtMockupPath);
const { width: tShirtMockupWidth, height: tShirtMockupHeight } = tShirtMockupJimp.bitmap;


const HOST = process.env.CYCLIC_URL || 'localhost';

const CROP_URL_PREFIX = 'crop';
const CROP_WIDTH_FACTOR = 1.3;

const round = (n, decimals = 0) => Number(`${Math.round(`${n}e${decimals}`)}e-${decimals}`);

export async function upscaleImage(img, name, requestId) {
  const timelog = TimeLogger('upscaling process ' + name.slice(-10));
  
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
      webhook_completed: `${HOST}/webhooks/replicate-scale`
    }),
  }); timelog('response');

  const json = await response.json();

  if (response.status !== 201) {
    console.log('There is an error in resize image funciton:', json);
  }

  timelog(TimeLogger.END);

  return json;
}

// const getRndKey = () => Math.random().toString(36).slice(2); // example: aaim0im03kr

export async function cropImageJimp(src, id) {
  const timelog = TimeLogger('cropImageJimp_' + id);

  const srcImage = await Jimp.read(src); timelog('read');

  const { width, height } = srcImage.bitmap;
  const newWidth = width / CROP_WIDTH_FACTOR;
  const offset = (width - newWidth) / 2;
  // const offset = newWidth * (CROP_WIDTH_FACTOR - 1) / 2;

  const croppedImage = srcImage.crop(offset, 0, newWidth, height); timelog('crop async');

  const compX = (tShirtMockupWidth - newWidth) / 2;
  const compY = (tShirtMockupHeight - height) / 2;

  let tShirtBuffer = tShirtMockupJimp.composite(croppedImage, compX, compY).getBufferAsync(); timelog('composite async');

  const buffer = await croppedImage.getBufferAsync(Jimp.MIME_PNG); timelog('crop done');

  const name = `${CROP_URL_PREFIX}-${id}.png`;
  tShirtBuffer = await tShirtBuffer; timelog(TimeLogger.END);

  return {
    name,
    url: `${HOST}/images/${name}`,
    buffer,
    tShirtBuffer,
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
  const timelog = TimeLogger('cropImageSharp_' + id);

  const sharpImg = sharp(imgBuffer); timelog('buffer loaded');
  const { width, height } = await sharpImg.metadata(); timelog('meta');
  const newWidth = round(width / CROP_WIDTH_FACTOR);

  const croppedImageBuffer = await sharpImg
    .resize(newWidth, height)
    .png({
      progressive: true,
    })
    .withMetadata()
    .toBuffer(); /** RESULT WITH T-SHIRT */ timelog('crop done');

  const composeImageTShirt = tShirtMockupSharp.composite([
    {
      input: croppedImageBuffer,
      left: (tShirtMockupWidth - newWidth) / 2,
      top: (tShirtMockupHeight - height) / 2
    }
  ]).png({
    progressive: true,
  }).withMetadata(); timelog('composite async');
  const name = `${CROP_URL_PREFIX}-${id}.png`; 

  const tShirtBuffer = await composeImageTShirt.toBuffer(); timelog(TimeLogger.END);
  return {
    name,
    url: `${HOST}/images/${name}`,
    buffer: croppedImageBuffer,
    tShirtBuffer,
    lib: 'Sharp'
  };
}
