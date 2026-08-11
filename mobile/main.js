import { createApp } from 'vue';
import { createPinia } from 'pinia';
import piniaPersistedstate from 'pinia-plugin-persistedstate';
import App from './App.vue';
import router from './router/router';
import i18n from './utils/i18n';
import { formatMilliseconds, getCover, getQuality } from './utils/utils';
import ModalPlugin from './plugins/ModalPlugin';
import MessagePlugin from './plugins/MessagePlugin';

if (!import.meta.env.DEV) {
  console.log = () => {}
  console.warn = () => {}
}

const app = createApp(App);
const pinia = createPinia();
pinia.use(piniaPersistedstate);

app.config.globalProperties.$getCover = getCover;
app.config.globalProperties.$getQuality = getQuality;
app.config.globalProperties.$formatMilliseconds = formatMilliseconds;

app.config.errorHandler = (err, vm, info) => {
  console.error(`全局捕获异常: ${info}`, err);
};
app.config.warnHandler = (msg, vm, trace) => {
  console.warn(`全局捕获警告: ${msg}`, trace);
};
window.addEventListener('unhandledrejection', event => {
  console.error('未处理的 Promise 拒绝:', event.reason);
});

app.use(pinia);
app.use(router);
app.use(i18n);
app.use(ModalPlugin);
app.use(MessagePlugin);


app.mount('#app');
