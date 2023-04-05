// current routes list. 
const route = (req, res) => res.json(process.versions);
export default function (api) {
  api.get('/image', route);
  api.get('/last-images', route);
  api.get('/available-prompts', route);
  api.get('/prompt', route);
  api.get('/images/v0/:image', route);
  api.get('/os', route);
  api.get('/pv', route);
  api.get('/images/:image', route);
  api.post('/prompt', route);
  api.post('/printify-product', route);
}
