import {jpegSize} from '../../scanner/jpeg.mjs';
import { IMAGE_PREVIEW_GUARD } from '../../shared/previewPolicy.js';
import type {SitePreview} from '../../shared/types.js';

const fail=():never=>{throw new Error('Invalid site image.');};
export function mapImagePreview(raw:Record<string,unknown>,identity:{scanId:string;requestedUrl:string;url:string}):SitePreview {
  const {width,height,image,links,truncated}=raw;
  if(Object.keys(raw).sort().join(',')!=='capturedAt,height,image,kind,links,truncated,url,width'
    ||!Number.isInteger(width)||Number(width)<1||Number(width)>1280
    ||!Number.isInteger(height)||Number(height)<1||Number(height)>6000
    ||typeof truncated!=='boolean'||(truncated&&height!==6000)||typeof image!=='string'||image.length>2000000
    ||!/^[A-Za-z0-9+/]+={0,2}$/.test(image)||!Array.isArray(links)||links.length>200)return fail();
  const bytes=Buffer.from(image,'base64');
  if(bytes.length>1500000||bytes.toString('base64')!==image)return fail();
  const size=jpegSize(bytes);
  if(!size||size.width!==width||size.height!==height)return fail();
  const overlays=links.map(value=>{
    if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).sort().join(',')!=='height,width,x,y')return fail();
    const box=value as Record<string,number>;
    if(!Object.values(box).every(Number.isFinite)||box.x<0||box.y<0||box.width<=0||box.height<=0
      ||box.x+box.width>Number(width)+0.01||box.y+box.height>Number(height)+0.01)return fail();
    return `<span class="kp-link" aria-hidden="true" title="Link — navigation disabled" style="left:${box.x/Number(width)*100}%;top:${box.y/Number(height)*100}%;width:${box.width/Number(width)*100}%;height:${box.height/Number(height)*100}%"></span>`;
  }).join('');
  const title=new URL(identity.url).hostname;
  const html=IMAGE_PREVIEW_GUARD+`<title>Website image preview</title><style>html,body{margin:0;background:#fff}.kp-canvas{position:relative;width:100%;max-width:${width}px}.kp-canvas img{display:block;width:100%;height:auto}.kp-link{position:absolute;box-sizing:border-box}.kp-link:hover{outline:2px solid #d08020;background:rgba(208,128,32,.15)}</style><body><div class="kp-canvas"><img alt="Static image of the scanned page" width="${width}" height="${height}" src="data:image/jpeg;base64,${image}">${overlays}</div></body>`;
  return {mode:'public',kind:'image',...identity,title,capturedAt:raw.capturedAt as string,width:width as number,height:height as number,truncated,html,limitations:[
    'A static browser-rendered image from the same visit as this report. Links highlight on hover; navigation and forms are inactive.',
    'Only content loaded in the isolated browser is shown. Blocked resources, login requirements, consent screens and dynamic content can affect the image and findings.',
    truncated?'The preview shows the first 6,000 pixels of this long page; content below that is not included.':'The image covers the captured page at its scan viewport width.',
  ]};
}
