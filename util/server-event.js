
import Pusher from 'pusher';
import timers from 'node:timers/promises';

let events = [];
export default {
  instance: null,
  online: false,

  trigger(...data) {
    this.lazyInstance.trigger(...data);
  },

  get lazyInstance() {
    if (!this.online) {
      try {
        this.instance = new Pusher({
          appId: '1565571',
          key: 'de22d0c16c3acf27abc0',
          secret: 'df9fabf4bffb6e0ca242',
          cluster: 'eu',
          useTLS: true
        });
        if (events.length) {
          events.forEach(async (data, i) => {
            await timers.setTimeout(i * 100);
            this.instance.trigger(...data);
          });
          events = [];
        }
        this.online = true;
      } catch (e) {
        console.error(e);
        
        this.instance = {
          trigger(...data) {
            console.log('Pusher not started, data may be triggered later', ...data);
            events.push(data);
          }
        };
        this.online = false;
      }
    }

    return this.instance;
  }
};

