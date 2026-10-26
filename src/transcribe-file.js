export async function transcribeFile(file,api){
  if(import.meta.env.VITE_BLOB_UPLOAD==='true'){
    const {upload}=await import('@vercel/blob/client');
    const blob=await upload(`voice/${crypto.randomUUID()}`,file,{access:'private',handleUploadUrl:'/api/audio-upload',contentType:file.type||'audio/mpeg'});
    return api('/api/transcribe-upload',{method:'POST',body:JSON.stringify({pathname:blob.pathname})});
  }
  const body=new FormData();body.append('audio',file);
  return api('/api/transcribe',{method:'POST',body});
}
