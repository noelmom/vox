import{c as r}from"./createLucideIcon-DMDLbIDM.js";import{A as n,B as c}from"./api-DnYlYPLj.js";/**
 * @license lucide-react v0.575.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const s=[["path",{d:"M12 3v12",key:"1x0j5s"}],["path",{d:"m17 8-5-5-5 5",key:"7q97r8"}],["path",{d:"M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4",key:"ih7n3h"}]],f=r("upload",s),i=["vox:format","vox:mp3Quality","vox:wavQuality","vox:advanced","vox:voiceId","vox:tone","vox:theme","vox:widget.requests","vox:widget.minutes"];function u(e,t){try{const o=localStorage.getItem(e);return o!==null?JSON.parse(o):t}catch{return t}}function a(e,t){try{localStorage.setItem(e,JSON.stringify(t))}catch{}}async function h(){const e=await n();for(const[t,o]of Object.entries(e))i.includes(t)&&a(t,o);return e}async function p(e){for(const[t,o]of Object.entries(e))a(t,o);await c(e),window.dispatchEvent(new CustomEvent("vox:prefschanged"))}export{f as U,h,u as r,p as s,a as w};
