import express from 'express';
import * as dotenv from 'dotenv';

dotenv.config();

import cors from 'cors';
import bodyParser from 'body-parser';

import { promptGenerate, allPromptsGenerate, promptDiffusion } from './util/prompt-handler.js';
import { combineTShirtImage, resizeImage } from './util/image-handler.js';
import { getShops, uploadImage, getBlueprints, generateTShirtProduct } from './util/printify.js';
import { imagesCollection } from './util/db.js';
import { read } from './util/filestorage.js';

const api = express();

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
  const resultImages = {};
  const unused = 1;

  const updateQuery = {};

  if (req.body?.id) {
    const logId = `webhook-diffusion_${req.body?.id}`;

    console.time(logId);

    resultImages.prompt = req.body.input.prompt;
    resultImages.requestId = req.body.id;
    resultImages.images = {};

    const query = {
      prompt: resultImages.prompt,
      requestId: resultImages.requestId
    };

    if (req.body.error) {
      updateQuery = {
        error: req.body.error
      }
      await imagesCollection.updateOne(query, { $set: updateQuery }, { upsert: true });
    } else {
      const promises = req.body.output.map(async (imgUrl, i) => {
        console.timeLog(logId, i);
        const resizeRes = await resizeImage(imgUrl);

        console.timeLog(logId, i + '_resizeImage done');
        const combinedRes = await combineTShirtImage(imgUrl, req.body.id);
        const _updateQuery = {
          [`images.${resizeRes.id}`]: combinedRes
        }
        console.timeLog(logId, i + '_combineTShirtImage done');

        if (resizeRes.id) {
          combinedRes.generatedImg = imgUrl;
          await imagesCollection.updateOne(query, { $set: _updateQuery }, { upsert: true });
          console.timeLog(logId, i + '_generatedImg saved');

          const uploadToPrintifyRes = await uploadImage(`ai-scale-diffusion-result-${resizeRes.id}.png`, combinedRes.croppedImg || imgUrl);
          console.timeLog(logId, i + '_uploadImage done');

          combinedRes.printifyId = uploadToPrintifyRes.id;

          await imagesCollection.updateOne(query, { $set: _updateQuery }, { upsert: true });
          console.timeLog(logId, i + '_printifyId saved');
        } else {
          res.statusCode = 500;
          res.end(JSON.stringify({ detail: 'There is an error in Diffusion Resize: output is empty. Images did not generated' }));

          return;
        }
      })

      Promise.all(promises).then(() => {
        console.timeEnd(logId);
      }).catch(error => {
        console.error(error);
        console.timeEnd(logId);
      })
    }

    res.status(200).send({});
  } else {
    res.end(JSON.stringify({ detail: 'There is an error in Diffusion Resize: no id in body' }));
  }
});

api.post('/webhook-scale', async (req, res) => {
  if (req.body?.output) {
    const resizeId = req.body.id;
    const uploadToPrintifyRes = await uploadImage(`ai-scale-diffusion-result-${resizeId}.png`, req.body.output);
    const updateResult = await imagesCollection.updateOne(
      {
        [`images.${resizeId}`]: { $exists: true }
      },
      { 
        $set: { [`images.${resizeId}.imageFull`]: req.body.output, [`images.${resizeId}.printifyId`]: uploadToPrintifyRes.id }
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
