
import TimeLogger from './time-logger.js';

const HOST = process.env.CYCLIC_URL || 'localhost';

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

export async function loadImageFromUrl(imgUrl) {
  const res = await fetch(imgUrl);
  const chunks = [];
  for await (const chunk of res.body) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
