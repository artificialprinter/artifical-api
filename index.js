import os from 'node:os';

import bodyParser from 'body-parser';
import cors from 'cors';
import express from 'express';
import compression from 'compression';

import { getShops, getBlueprints, generateTShirtProduct } from './util/printify.js';
import { imagesCollection } from './util/db.js';
import { promptGenerate, allPromptsGenerate, promptDiffusion } from './util/prompt-handler.js';
import { read, readStream } from './util/filestorage.js';
import webhooksController from './controllers/webhooks.js';

const api = express();

api.use(cors());
api.use(compression());
api.use(bodyParser.json());
api.use('/favicon.ico', express.static('./public/favicon.ico', {
  maxAge: 1000 * 60 * 60 * 8, // 8h
  immutable: true
}));
api.get('/', async (req, res) => {
  res.send('<h1>Hello!</h1>');
});
api.use('/webhooks', webhooksController());

api.post('/prompt', promptHandler);

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

async function sendImage(image, res) {
  console.log('buffer fallback :>> ', image);
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

async function sendImageStream(image, res) {
  const fileResult = readStream(image);

  fileResult
    .on('httpHeaders', function (statusCode, headers) {
      if (statusCode !== 200) {
        console.error('cant get', image);
        res.statusCode = 500;
        res.end(JSON.stringify({ detail: fileResult.error }));
        return;
      }
      console.log('headers :>> ', headers);
      res.set('Content-Length', headers['content-length']);
      res.set('Cache-Control', 'max-age=31536000'); // 1 year
      res.set('Content-Type', headers['content-type'] || 'image/png');
      this.response.httpResponse
        .createUnbufferedStream()
        .pipe(res);
    })
    .on('error', async (error) => {
      console.error('readStream', error);

      return sendImage(image, res);
    })
    .send();

  if (fileResult.error) {
    return sendImage(image, res);
  }
}

// use buffer - full load and resend image
api.get('/images/v0/:image', async (req, res) => {
    const { image } = req.params;

    if (!image) {
      res.statusCode = 500;
      res.end(JSON.stringify({ detail: 'No image name provided!' }));
    } else {
      return sendImage(image, res);
    }
});

api.get('/os', (req, res) => {
  const prop = os[req.query.q || 'cpus'];
  res.json(prop?.() || prop);
});

api.get('/pv', (req, res) => res.json(process.versions));

// use stream - piping img from s3 to response
api.get('/images/:image', async (req, res) => {
  const { image } = req.params;

  if (!image) {
    res.statusCode = 500;
    res.end(JSON.stringify({ detail: 'No image name provided!' }));
  } else {
    try {
      return sendImageStream(image, res);
    } catch (e) {
      console.error(e);
      return sendImage(image, res);
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

async function promptHandler(req, res) {
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
    const requestedBefore = new Date();
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
      prompt: prompts[i],
      requestedBefore,
      requestedAfter: new Date()
    });

    result.push(successRes);
  }

  console.log('Send prompt result :>> ', result);

  res.statusCode = 201;
  res.end(JSON.stringify(result));
}
