function normalized(value){return String(value || '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');}
function sourceExcerpt(quote,text){
 const needle=normalized(quote);if(needle.length<8)return null;
 let clean='',offsets=[];for(let i=0;i<text.length;i++){for(const c of normalized(text[i])){clean+=c;offsets.push(i);}}
 const start=clean.indexOf(needle);return start<0?null:text.slice(offsets[start],offsets[start+needle.length-1]+1);
}
function sourceBlocks(text){
 const sections=text.split(/(?<=\s)(?=\d{1,2}\.\s+[A-Z])/u).filter(s=>s.trim());
 const blocks=[];
 for(const section of sections){
  // Preserve exact source bytes while limiting the size of each addressable block.
  for(let start=0;start<section.length;){let end=Math.min(start+2600,section.length);if(end<section.length){const boundary=section.lastIndexOf(' ',end);if(boundary>start+1300)end=boundary;}const value=section.slice(start,end).trim();if(value)blocks.push({id:`S${blocks.length+1}`,text:value});start=end;}
 }
 return blocks;
}
module.exports={normalized,sourceExcerpt,sourceBlocks};
