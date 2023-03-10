import sharp from 'sharp';

const HOST = process.env.CYCLIC_URL || 'localhost';

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

export async function loadImageFromUrl(imgUrl) {
  const res = await fetch(imgUrl);
  const chunks = [];
  for await (const chunk of res.body) {
    chunks.push(chunk);
  }
  return sharp(Buffer.concat(chunks));
}

export async function cropImage(sharpImg, id) {
  console.time('metadata');
  const sharpImgMeta = await sharpImg.metadata();
  console.timeEnd('metadata');
  const uniqueNumber = `${getRndKey()}-${id}`;

  const croppedImageBuffer = await sharpImg
    .resize(round(sharpImgMeta.width / 1.12), sharpImgMeta.height)
    .toBuffer(); /** RESULT WITH T-SHIRT */

  const name = `${CROP_URL_PREFIX}-${uniqueNumber}.png`;

  return {
    name,
    url: `${HOST}/images/${name}`,
    buffer: croppedImageBuffer
  };
}
