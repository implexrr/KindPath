import {jpegSize} from './jpeg.mjs';
// Pixels are captured inside the isolated worker. No source markup or URLs are
// replayed in the app; link geometry is only used for inert hover highlights.
export async function capturePageImage(page) {
  await page.evaluate(()=>scrollTo(0,0));
  const geometry=await page.evaluate(()=>({
    width:innerWidth,
    height:Math.max(innerHeight,document.documentElement.scrollHeight,document.body?.scrollHeight??0),
  }));
  const width=Math.min(1280,geometry.width),height=Math.min(6000,geometry.height);
  const links=await page.evaluate(({width,height})=>{
    const boxes=[];
    for(const link of document.querySelectorAll('a')){
      if(boxes.length>=200)break;
      const style=getComputedStyle(link);
      if(style.display==='none'||style.visibility==='hidden')continue;
      for(const rect of link.getClientRects()){
        if(boxes.length>=200)break;
        const x=Math.max(0,rect.left+scrollX),y=Math.max(0,rect.top+scrollY);
        const right=Math.min(width,rect.right+scrollX),bottom=Math.min(height,rect.bottom+scrollY);
        if(right>x&&bottom>y)boxes.push({x,y,width:right-x,height:bottom-y});
      }
    }
    return boxes;
  },{width,height});
  let image=await page.screenshot({fullPage:true,type:'jpeg',quality:80,clip:{x:0,y:0,width,height},caret:'hide',timeout:5000});
  if(image.length>1500000)image=await page.screenshot({fullPage:true,type:'jpeg',quality:50,clip:{x:0,y:0,width,height},caret:'hide',timeout:5000});
  if(image.length>1500000)throw new Error('Preview image exceeds its byte limit');
  const size=jpegSize(image);
  if(!size||size.width!==width||size.height!==height)throw new Error('Page layout changed during screenshot');
  return {kind:'image',url:page.url(),capturedAt:new Date().toISOString(),width,height,
    truncated:geometry.height>height,image:image.toString('base64'),links};
}
