import express from 'express';
import * as dotenv from 'dotenv';

dotenv.config();

import cors from 'cors';
import bodyParser from 'body-parser';
import { setTimeout } from 'node:timers/promises';

import { promptGenerate, allPromptsGenerate, promptDiffusion } from './util/prompt-handler.js';
import { combineTShirtImageV2, resizeImage } from './util/image-handler.js';
import { getShops, uploadImage, getBlueprints, generateTShirtProduct } from './util/printify.js';
import { imagesCollection } from './util/db.js';
import { read, readStream } from './util/filestorage.js';

const api = express();

import Pusher from 'pusher';

const pusher = new Pusher({
  appId: '1565571',
  key: 'de22d0c16c3acf27abc0',
  secret: 'df9fabf4bffb6e0ca242',
  cluster: 'eu',
  useTLS: true
});

api.use('/favicon.ico', express.static('./public/favicon.ico'));
api.use(cors());
api.use(bodyParser.json());

api.get('/', async (req, res) => {
  res.statusCode = 200;
  res.send('<h1>Hello!</h1>');
});

api.post('/prompt', async (req, res) => {
  let prompts;

  if (req.body.fullPrompt) {
    prompts = [req.body.fullPrompt];
  } else if (req.body.prompt) {
    if (req.body.preventAutoExtend) {
      prompts = [req.body.prompt];
    } else {
      prompts = await promptGenerate(req.body.prompt, 1);
    }
  } else {
    res.statusCode = 500;
    res.end(JSON.stringify({ detail: 'Prompt param not provided!' }));

    return;
  }
  
  const result = [];

  for (let i = 0; i < prompts.length; i++) {
    const response = await promptDiffusion(prompts[i]);
  
    if (response.status !== 201) {
      let error = await response.json();

      res.statusCode = 500;
      res.end(JSON.stringify({ detail: error.detail }));

      return;
    }

    const successRes = await response.json();
  
    await imagesCollection.insertOne({
      requestId: successRes.id,
      initialPrompt: req.body.prompt,
      prompt: prompts[i]
    });

    result.push(successRes);
  }

  console.log('Send prompt result :>> ', result);

  res.statusCode = 201;
  res.end(JSON.stringify(result));
});

api.post('/webhook-diffusion', async (req, res) => {
  if (!req.body?.id) {
    return res.end({ detail: 'There is an error in Diffusion: no id in body' });
  }
  const { id } = req.body; 

  if (req.body.error) {
    imagesCollection
      .updateOne(query, {
        $set: {
          error: req.body.error
        }
        }, { upsert: true })
      .catch(console.error);
    
    return res.end({ detail: 'There is an error in Diffusion: ' + req.body.error });
  }

  const resultImages = {};
  const logId = `webhook-diffusion_${req.body?.id}`;

  console.time(logId);

  resultImages.prompt = req.body.input.prompt;
  resultImages.requestId = req.body.id;
  resultImages.images = {};

  const query = {
    prompt: resultImages.prompt,
    requestId: resultImages.requestId
  };

  pusher.trigger(id, '1', {
    step: 1,
    images: req.body.output,
    [id]: {
      generatedImg: req.body.output
    }
  });

  // parallel 2 images
  const promises = req.body.output.map(async (imgUrl, i) => {
    const id = imgUrl.split('/').at(-2);
    // save immediately
    await setTimeout(i * 100);
    console.timeLog(logId, i);
    imagesCollection.updateOne(query, { $set: {
      [`images.${id}.generatedImg`]: imgUrl
    } }, { upsert: true }).catch(console.error);

    const upscaling = resizeImage(imgUrl).catch(console.error);

    console.timeLog(logId, i + '_combineTShirtImage start');
    const combinedRes = await combineTShirtImageV2(imgUrl, req.body.id);
    console.timeLog(logId, i + '_combineTShirtImage done');

    combinedRes.generatedImg = imgUrl;
    pusher.trigger(id, '1', {
      step: 2,
      i,
      [id]: combinedRes
    });
    const _updateQuery = {
      [`images.${id}`]: combinedRes
    };
    imagesCollection.updateOne(query, { $set: _updateQuery }, { upsert: true }).catch(console.error);

    const uploading = uploadImage(`ai-scale-diffusion-result-${id}.png`, combinedRes.croppedImg || imgUrl);

    console.timeLog(logId, i + '_combineTShirtImage done 2');

    const uploadToPrintifyRes = await uploading;
    console.timeLog(logId, i + '_uploadImage done');

    pusher.trigger(id, '1', {
      id,
      step: 3,
      i,
      [id]: {
        printifyId: uploadToPrintifyRes.id
      }
    });
    imagesCollection.updateOne(query, {
      $set: {
        [`images.${id}.printifyId`]: uploadToPrintifyRes.id
      }
    }, { upsert: true }).catch(console.error);
    
    await upscaling;
    console.timeLog(logId, i + '_upscaling done');
  });

  Promise.all(promises).then(() => {
    console.timeEnd(logId);
  }).catch(error => {
    console.error(error);
    console.timeEnd(logId);
  });

  res.status(200).send({});
});

api.post('/webhook-scale', async (req, res) => {
  if (req.body?.output) {
    const id = req.body.input?.image.split('/').at(-2) || req.body.id;
    const uploadToPrintifyRes = await uploadImage(`ai-scale-diffusion-result-${id}.png`, req.body.output);

    const updateResult = await imagesCollection.updateOne(
      {
        [`images.${id}`]: { $exists: true }
      },
      { 
        $set: { [`images.${id}.imageFull`]: req.body.output, [`images.${id}.printifyId`]: uploadToPrintifyRes.id }
      }
    );

    res.status(200).send(updateResult);
  } else {
    res.statusCode = 500;
    res.end(JSON.stringify({ detail: 'There is an error in Scale: output is empty. Images did not generated' }));
  }
});


api.get('/image', async (req, res) => {  
  let result;
  
  if (req.query.requestId) {
    result = await imagesCollection.find({ requestId: { $in: req.query.requestId.split(',') }, images: { $ne: null } }).toArray();
  } else if (req.query.imageId) {
    result = await imagesCollection.find({ [`images.${req.query.imageId}`]: { $exists: true } }).toArray();
  } else if (req.query.prompt) {
    result = await imagesCollection.find({ prompt: `/.*${req.query.prompt}.*/i`, images: { $ne: null } }).toArray();
  } else {
    res.statusCode = 500;
    return res.end(JSON.stringify({ detail: 'Request should contain requestId or prompt field' }));
  }

  res.status(200).send(result);
});


api.get('/last-images', async (req, res) => {  
  const length = req.query.length? parseInt(req.query.length, 10) : 10;
  let result;
  
  result = await imagesCollection.find({}).limit(length).sort({_id: -1}).toArray();

  res.status(200).send(result);
});

api.get('/available-prompts', async (req, res) => {
  if (req.query.prompt) {
    const prompts = await allPromptsGenerate(req.query.prompt);

    res.statusCode = 200;
    res.end(JSON.stringify(prompts));
  } else {
    res.statusCode = 500;
    res.end(JSON.stringify({ detail: 'No prompts provided!' }));
  }
});

api.get('/prompt', async (req, res) => {
  const response = await fetch(
    'https://api.replicate.com/v1/predictions/' + req.query.id,
    {
      headers: {
        Authorization: `Token ${process.env.REPLICATE_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
    }
  );

  if (response.status !== 200) {
    let error = await response.json();

    res.statusCode = 500;
    res.end(JSON.stringify({ detail: error.detail }));

    return;
  }

  const prediction = await response.json();

  res.end(JSON.stringify(prediction));
});

api.get('/images/:image', async (req, res) => {
    const { image } = req.params;

    if (!image) {
      res.statusCode = 500;
      res.end(JSON.stringify({ detail: 'No image name provided!' }));
    } else {
      const fileResult = await read(image);

      if (fileResult.error) {
        res.statusCode = 500;
        res.end(JSON.stringify({ detail: fileResult.error }));
      } else {
        res.statusCode = 200;
        res.set('Content-type', 'image/png');
        res.send(fileResult).end();
      }
    }
});

api.get('/images/v2/:image', async (req, res) => {
  const { image } = req.params;

  if (!image) {
    res.statusCode = 500;
    res.end(JSON.stringify({ detail: 'No image name provided!' }));
  } else {
    const fileResult = await readStream(image);

    fileResult.on('httpHeaders', function (statusCode, headers) {
      if (statusCode !== 200) {
        console.error('cant get', image);
        res.statusCode = 500;
        res.end(JSON.stringify({ detail: fileResult.error }));
        return;
      }
      res.set('Content-Length', headers['content-length']);
      res.set('Content-Type', headers['content-type'] || 'image/png');
      this.response.httpResponse.createUnbufferedStream()
          .pipe(res);
    })
    .send();

    if (fileResult.error) {
      res.statusCode = 500;
      res.end(JSON.stringify({ detail: fileResult.error }));
    }
  }
});

api.post('/printify-product', async (req, res) => {
  const { imageId, type, prompt, number } = req.body;
  const shops = await getShops;
  const blueprints = await getBlueprints;
  const imageData = await imagesCollection.find({ [`images.${imageId}`]: { $exists: true }}).toArray();
  
  let product;

  console.log('{ imageId, type, prompt, number }', { imageId, type, prompt, number });
  console.log('imageData', imageData);

  if (type === 't-shirt') {
    product = await generateTShirtProduct(shops, blueprints, imageData[0].images[imageId].printifyId, prompt, number);
  }

  res.statusCode = 200;
  res.end(JSON.stringify(product));
});


// /////////////////////////////////////////////////////////////////////////////
// Catch all handler for all other request.
api.use('*', (req,res) => {
  res.sendStatus(404).end();
});

// /////////////////////////////////////////////////////////////////////////////
// Start the server
const port = process.env.PORT || 3000;
api.listen(port, () => {
  console.log(`index.js listening at http://localhost:${port}`);
});
