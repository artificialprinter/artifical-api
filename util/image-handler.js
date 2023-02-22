import Jimp from 'jimp';
import { write } from './filestorage.js';

const HOST = process.env.CYCLIC_URL || 'localhost';

const tShirtMockupPath = './public/t-shirt-mockup.png';
const tShirtMockup = await Jimp.read(tShirtMockupPath);
const TSHIRT_URL_PREFIX = 't-shirt-image';
const IMAGE_URL_PREFIX = 'small-image';

async function resizeImage(img) {
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
            scale: 4,
            face_enhance: true
        },
        webhook_completed: `${HOST}/webhook-scale`
      }),
    });
  
    if (response.status !== 201) {
      let error = await response.json();

      console.log('There is an error in resize image funciton:', error);

      return error;
    }
  
    return await response.json();
}
async function combineTShirtImage(img, id) {
    const srcImage = await Jimp.read(img);
    const { width, height } = tShirtMockup.bitmap;
    const uniqueNumber = `${Math.random()}-${id}`;

    const resizedSrc = srcImage.scaleToFit(srcImage.bitmap.width / 1.2, srcImage.bitmap.height / 1.2, Jimp.RESIZE_NEAREST_NEIGHBOR);
    const composeImageTShirt = tShirtMockup.composite(resizedSrc, (width - resizedSrc.bitmap.width) / 2, height / 3.7);
    
    /** GET IMAGES BUFFERS: */
    const standardImgBuffer = await srcImage.getBufferAsync(Jimp.MIME_PNG); /** SMALL SRC IMG */
    const tShirtResultBuffer = await composeImageTShirt.getBufferAsync(Jimp.MIME_PNG); /** RESULT WITH T-SHIRT */

    write(`${IMAGE_URL_PREFIX}-${uniqueNumber}.png`, standardImgBuffer);
    write(`${TSHIRT_URL_PREFIX}-${uniqueNumber}.png`, tShirtResultBuffer);

    return {
        imageStandard: `${HOST}/images/${IMAGE_URL_PREFIX}-${uniqueNumber}.png`,
        tShirtResult: `${HOST}/images/${TSHIRT_URL_PREFIX}-${uniqueNumber}.png`,
    };
}


export {
    combineTShirtImage,
    resizeImage
};