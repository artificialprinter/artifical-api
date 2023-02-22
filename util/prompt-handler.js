const IMAGE_MAX_SIZE = {
    width: 512,
    height: 576,
};
const HOST = process.env.CYCLIC_URL || 'localhost';
const IMAGES_PER_REQUEST = 2;
import promptData from './prompt-data.js';

async function promptGenerate(prompt) {
    const randomKey1 = Math.floor(Math.random() * (promptData.length / 2)) + promptData.length - 2;
    const randomKey2 = Math.floor(Math.random() * (promptData.length / 2));

    return [`${prompt}, ${promptData[randomKey1].value}`, `${prompt}, ${promptData[randomKey2].value}`];
}

async function allPromptsGenerate(prompt) {
    const prompts = [];

    promptData.forEach((item) => {
      prompts.push(`${prompt}, ${item.value}`);
    });

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
            width: IMAGE_MAX_SIZE.width,
            height: IMAGE_MAX_SIZE.height,
            num_outputs: IMAGES_PER_REQUEST
          },
          webhook_completed: `${HOST}/webhook-diffusion`
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