import Jimp from 'jimp';
import { write } from './filestorage.js';

const HOST = process.env.CYCLIC_URL || 'localhost';

const tShirtMockupPath = './public/t-shirt-mockup.png';
const tShirtMockup = await Jimp.read(tShirtMockupPath);
const TSHIRT_URL_PREFIX = 't-shirt-image';
const CROP_URL_PREFIX = 'crop-image';

async function resizeImage(img) {
  console.time('resizeImage')
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

  console.timeLog('resizeImage')
  if (response.status !== 201) {
    let error = await response.json();

    console.log('There is an error in resize image funciton:', error);

    return error;
  }


  const json = await response.json();

  console.timeEnd('resizeImage');

  return json;
}
async function combineTShirtImage(img, id) {
    const srcImage = await Jimp.read(img);
    const srcImageToCrop = srcImage.clone();
    const { width, height } = tShirtMockup.bitmap;
    const uniqueNumber = `${Math.random().toString(36).slice(2)}-${id}`;

    const cropppedImage = srcImageToCrop.resize(srcImageToCrop.bitmap.width / 1.12, srcImage.bitmap.height, Jimp.RESIZE_BILINEAR);
    const resizedSrc = srcImage.resize(srcImage.bitmap.width / 1.4, srcImage.bitmap.height / 1.2, Jimp.RESIZE_BILINEAR);
    const composeImageTShirt = tShirtMockup.composite(resizedSrc, (width - resizedSrc.bitmap.width) / 2, height / 4.1);
    
    /** GET IMAGES BUFFERS: */
    const tShirtResultBuffer = await composeImageTShirt.getBufferAsync(Jimp.MIME_PNG); /** RESULT WITH T-SHIRT */
    const cropResultBuffer = await cropppedImage.getBufferAsync(Jimp.MIME_PNG); /** RESULT WITH T-SHIRT */

    write(`${TSHIRT_URL_PREFIX}-${uniqueNumber}.png`, tShirtResultBuffer);
    write(`${CROP_URL_PREFIX}-${uniqueNumber}.png`, cropResultBuffer);

    return {
        croppedImg: `${HOST}/images/${CROP_URL_PREFIX}-${uniqueNumber}.png`,
        tShirtResult: `${HOST}/images/${TSHIRT_URL_PREFIX}-${uniqueNumber}.png`,
    };
}


export {
    combineTShirtImage,
    resizeImage
};
