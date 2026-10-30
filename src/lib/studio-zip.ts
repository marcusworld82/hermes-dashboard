// A small, uncompressed ZIP writer. Runs in the browser; no upload or provider call.
export function studioZip(files:{name:string;bytes:Uint8Array}[]) {
 if(files.length>20)throw Error('Too many files.');
 const chunks:Uint8Array[]=[],directory:Uint8Array[]=[];let offset=0;
 const crc=(bytes:Uint8Array)=>{let c=0xffffffff;for(const byte of bytes){c^=byte;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return (c^0xffffffff)>>>0;};
 const header=(size:number)=>{const bytes=new Uint8Array(size);return {bytes,view:new DataView(bytes.buffer)};};
 for(const file of files){if(!/^[a-zA-Z0-9_.-]+$/.test(file.name))throw Error('Unsafe archive filename.');const name=new TextEncoder().encode(file.name),checksum=crc(file.bytes),local=header(30+name.length),central=header(46+name.length);
  local.view.setUint32(0,0x04034b50,true);local.view.setUint16(4,20,true);local.view.setUint32(14,checksum,true);local.view.setUint32(18,file.bytes.length,true);local.view.setUint32(22,file.bytes.length,true);local.view.setUint16(26,name.length,true);local.bytes.set(name,30);
  central.view.setUint32(0,0x02014b50,true);central.view.setUint16(4,20,true);central.view.setUint16(6,20,true);central.view.setUint32(16,checksum,true);central.view.setUint32(20,file.bytes.length,true);central.view.setUint32(24,file.bytes.length,true);central.view.setUint16(28,name.length,true);central.view.setUint32(42,offset,true);central.bytes.set(name,46);
  chunks.push(local.bytes,file.bytes);directory.push(central.bytes);offset+=local.bytes.length+file.bytes.length;
 }
 const directorySize=directory.reduce((n,b)=>n+b.length,0),end=header(22);end.view.setUint32(0,0x06054b50,true);end.view.setUint16(8,files.length,true);end.view.setUint16(10,files.length,true);end.view.setUint32(12,directorySize,true);end.view.setUint32(16,offset,true);
 const all=[...chunks,...directory,end.bytes],result=new Uint8Array(all.reduce((n,b)=>n+b.length,0));let at=0;for(const chunk of all){result.set(chunk,at);at+=chunk.length;}return result;
}
