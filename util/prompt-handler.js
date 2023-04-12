import promptData from './prompt-data.js';

const IMAGE_MAX_SIZE = {
    width: 512,
    height: 512,
};

const IMAGES_PER_REQUEST = 2;

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
  return getRandomElements(prompt, rndPromptsCount)
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
    return fetch('https://api.replicate.com/v1/predictions', {
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
          webhook_completed: 'https://r4qlyqjkf4sankpkqcvzdqgm540sozvz.lambda-url.eu-central-1.on.aws/'
        }),
      });
}

/**
 * CUDA out of memory. Tried to allocate 11.25 GiB (GPU 0; 39.59 GiB total capacity; 17.85 GiB already allocated; 3.04 GiB free; 34.80 GiB reserved in total by PyTorch) If reserved memory is >> allocated memory try setting max_split_size_mb to avoid fragmentation.  See documentation for Memory Management and PYTORCH_CUDA_ALLOC_CONF
 */

export {
  promptGenerate,
  allPromptsGenerate,
  promptDiffusion
};

