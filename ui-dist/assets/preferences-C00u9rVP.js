import{c as r}from"./createLucideIcon-CrE3Mjyz.js";import{A as n,B as c}from"./api-B9E63w54.js";/**
 * @license lucide-react v0.575.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const s=[["path",{d:"M12 3v12",key:"1x0j5s"}],["path",{d:"m17 8-5-5-5 5",key:"7q97r8"}],["path",{d:"M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4",key:"ih7n3h"}]],u=r("upload",s),i=["vox:format","vox:mp3Quality","vox:wavQuality","vox:advanced","vox:voiceId","vox:tone","vox:theme","vox:widget.requests","vox:widget.minutes","vox:update-channel","vox:auto-update-checks"];function f(e,t){try{const a=localStorage.getItem(e);return a!==null?JSON.parse(a):t}catch{return t}}function o(e,t){try{localStorage.setItem(e,JSON.stringify(t))}catch{}}async function h(){const e=await n();for(const[t,a]of Object.entries(e))i.includes(t)&&o(t,a);return e}async function p(e){for(const[t,a]of Object.entries(e))o(t,a);await c(e),window.dispatchEvent(new CustomEvent("vox:prefschanged"))}export{u as U,h,f as r,p as s,o as w};
