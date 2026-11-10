// Inspect the encoded raster dimensions without decoding pixels on the host.
export function jpegSize(bytes) {
  if(!(bytes instanceof Uint8Array)||bytes.length<4)return undefined;
  const word=offset=>(bytes[offset]<<8)|bytes[offset+1];
  if(word(0)!==0xffd8||word(bytes.length-2)!==0xffd9)return undefined;
  let size;
  for(let offset=2;offset<bytes.length-2;){
    if(bytes[offset++]!==0xff)return undefined;
    while(bytes[offset]===0xff)offset++;
    const marker=bytes[offset++];
    if(offset+2>bytes.length)return undefined;
    const length=word(offset);
    if(length<2||offset+length>bytes.length)return undefined;
    if(marker===0xc0||marker===0xc2){
      if(size||length<8||bytes[offset+2]!==8)return undefined;
      size={width:word(offset+5),height:word(offset+3)};
    }
    if(marker===0xda)return size;
    offset+=length;
  }
  return undefined;
}
