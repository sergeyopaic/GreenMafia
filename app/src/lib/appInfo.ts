import { version } from '../../package.json';

export const APP_VERSION = version;
const sha = import.meta.env.VITE_BUILD_SHA;
export const BUILD_ID = typeof sha === 'string' && /^[a-f0-9]{7,40}$/i.test(sha) ? sha : null;
export const SUPPORT_URL = 'https://github.com/sergeyopaic/GreenMafia/issues';
