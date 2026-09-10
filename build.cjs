const fs=require('node:fs');
fs.rmSync('dist',{recursive:true,force:true});fs.mkdirSync('dist');
for(const name of ['index.html','orbit-theme.css','workspace.css','workspace.js','workspace-plus.js','source-engine.js','assets'])fs.cpSync(name,`dist/${name}`,{recursive:true});
console.log('Orbit static workspace built.');
