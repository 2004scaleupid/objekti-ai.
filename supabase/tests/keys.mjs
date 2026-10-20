import crypto from 'node:crypto';
export const SECRET='super-secret-jwt-token-with-at-least-32-characters-long';
const b64u=b=>Buffer.from(b).toString('base64url');
export function jwt(payload,exp=3600*24*365){const h=b64u(JSON.stringify({alg:'HS256',typ:'JWT'})),p=b64u(JSON.stringify({iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+exp,...payload}));return h+'.'+p+'.'+crypto.createHmac('sha256',SECRET).update(h+'.'+p).digest('base64url');}
export const ANON=jwt({role:'anon'}),SERVICE=jwt({role:'service_role'});
if(process.argv[2]==='service')console.log(SERVICE);
