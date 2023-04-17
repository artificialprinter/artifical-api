import promptData from './prompt-data.js';

const IMAGE_MAX_SIZE = {
    width: 512,
    height: 512,
};

const IMAGES_PER_REQUEST = 2;

export const LAMBDA_URL = 'https://q65eekxnmbwkizo3masynrpea40rylba.lambda-url.us-east-1.on.aws/';
const REPLICATE_URL = 'https://api.replicate.com/v1/predictions';
const {
  SDXL_API_TOKEN,
  SDXL_VERSION = 'stable-diffusion-xl-beta-v2-2-2'
} = process.env;
const SDXL_URL = `https://api.stability.ai/v1/generation/${SDXL_VERSION}/text-to-image`;

const rndInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

function getRandomElements(arr, count) {
  const rndOffset = Math.floor(arr.length / count);
  const remnant = arr.length % count;

  return Array(count)
    .fill()
    .map((_v, i) => {
      const min = rndOffset * i;
      const max = rndOffset * (i + 1) + (i === count - 1 ? remnant : 0) - 1;

      return rndInt(min, max);
    });
}

async function promptGenerate(prompt, rndPromptsCount) {
  return getRandomElements(promptData, rndPromptsCount)
    .map(rndKey => `${prompt}, ${promptData[rndKey].value}`);
}

async function allPromptsGenerate(prompt) {
  const prompts = Array(promptData.length);

  promptData.forEach((item, i) => {
    prompts[i] = `${prompt}, ${item.value}`;
  });

  prompts.sort(() => Math.random() - 0.5);

  return prompts;
}

function promptDiffusion(prompt) {
  return fetch(REPLICATE_URL, {
        method: 'POST',
        headers: {
          Authorization: `Token ${process.env.REPLICATE_API_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          version: process.env.REPLICATE_DIFFUSION_VERSION,
          input: { 
            prompt,
            image_dimensions: `${IMAGE_MAX_SIZE.width}x${IMAGE_MAX_SIZE.height}`,
            num_outputs: IMAGES_PER_REQUEST,
            negative_prompt: 'Not centered, cropped'
          },
          webhook_completed: LAMBDA_URL
        }),
      });
}

function promptSDXL(prompt) {
  const myHeaders = new Headers();
  myHeaders.append("Content-Type", "application/json");
  myHeaders.append("Authorization", `Bearer ${SDXL_API_TOKEN}`);

  const raw = JSON.stringify({
    "height": IMAGE_MAX_SIZE.height,
    "width": IMAGE_MAX_SIZE.width,
    "text_prompts": [
      {
        "text": prompt,
        "weight": 0.5
      },
      {
        "text": "Not centered, cropped",
        "weight": -0.5
      }
    ],
    "samples": IMAGES_PER_REQUEST,
    "style_preset": "anime"
  });

  const requestOptions = {
    method: 'POST',
    headers: myHeaders,
    body: raw,
    redirect: 'follow'
  };

  return fetch(SDXL_URL, requestOptions);
}

export {
  promptSDXL,
  promptGenerate,
  allPromptsGenerate,
  promptDiffusion
};

