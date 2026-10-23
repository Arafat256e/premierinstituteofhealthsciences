/* Administrator authentication, page-copy editor, content CRUD, and submissions inbox. */
(() => {
  document.addEventListener('DOMContentLoaded', async () => {
    const status = $('[data-admin-status]');
    if (!window.sb) {
      setStatus(status, 'Supabase is not configured. Update js/supabase-config.js, then reload this page.', true);
      const login = $('#login-form'); if (login) login.addEventListener('submit', e => { e.preventDefault(); setStatus(status, 'Configure Supabase before signing in.', true); });
      return;
    }
    const login = $('#login-form');
    if (login) login.addEventListener('submit', async event => {
      event.preventDefault(); setStatus(status, 'Signing in…');
      const form = new FormData(login);
      try {
        const { error } = await sb.auth.signInWithPassword({ email: form.get('email'), password: form.get('password') });
        if (error) throw error;
        location.href = 'dashboard.html';
      } catch (error) { setStatus(status, error.message || 'Sign-in failed.', true); }
    });
    const { data: { session } } = await sb.auth.getSession();
    if (login && session) { location.href = 'dashboard.html'; return; }
    if (!document.body.dataset.adminPage) return;
    if (!session) { location.href = 'admin.html'; return; }
    const { data: allowed, error: allowError } = await sb.from('admin_users').select('user_id').eq('user_id', session.user.id).maybeSingle();
    if (allowError || !allowed) {
      await sb.auth.signOut(); setStatus(status, 'This account is not authorised to administer the website. Ask the project owner to add it to admin_users.', true); return;
    }
    document.querySelectorAll('[data-admin-only]').forEach(el => el.classList.remove('hidden'));
    const email = $('[data-admin-email]'); if (email) email.textContent = session.user.email || 'Administrator';
    $('#signout')?.addEventListener('click', async () => { await sb.auth.signOut(); location.href = 'admin.html'; });
    if (document.body.dataset.adminPage === 'dashboard') loadCounts();
    if (document.body.dataset.adminPage === 'content') initContentManager(session.user.id);
    if (document.body.dataset.adminPage === 'inquiries') initInquiries();
  });

  async function loadCounts() {
    const map = [['admissions','admissions-count'],['contact_inquiries','inquiries-count'],['career_applications','career-count'],['student_requests','student-count']];
    await Promise.all(map.map(async ([table,id]) => { const { count, error } = await sb.from(table).select('*',{count:'exact',head:true}); const el=document.getElementById(id); if(el)el.textContent=error?'—':(count??0); }));
  }

  const TABLES = {
    programs: { label:'Programmes', fields:[['title','Title','text',true],['award','Award / qualification','text'],['duration','Duration','text'],['description','Description','textarea'],['requirements','Entry requirements / guidance','textarea'],['sort_order','Display order','number'],['is_published','Publication status','boolean']] },
    publications: { label:'Publications', fields:[['title','Title','text',true],['category','Category','select',true,['Circular','Form','Media','Policy','Academic calendar','Other']],['summary','Summary','textarea'],['file_url','Resource URL (PDF/image/document)','url'],['published_at','Publication date','date'],['is_published','Publication status','boolean']] },
    career_opportunities: { label:'Career opportunities', fields:[['title','Position title','text',true],['department','Department','text'],['location','Location','text'],['employment_type','Employment type','select',false,['Full-time','Part-time','Contract','Temporary','Internship','Volunteer','Other']],['description','Description','textarea'],['deadline','Application deadline','date'],['apply_url','Application link (optional)','url'],['is_published','Publication status','boolean']] },
    announcements: { label:'Announcements', fields:[['title','Title','text',true],['body','Announcement text','textarea'],['published_at','Publication date','date'],['is_published','Publication status','boolean']] },
    gallery_items: { label:'School gallery', fields:[['title','Image title','text'],['image_url','Image URL or public Storage URL','url',true],['alt_text','Image description (accessibility)','text'],['caption','Caption','textarea'],['sort_order','Display order','number'],['is_published','Publication status','boolean']] }
  };
  const SUBMISSIONS = {
    contact_inquiries: {label:'Contact inquiries', columns:[['name','Name'],['email','Email'],['phone','Phone'],['subject','Subject'],['message','Message'],['status','Status'],['created_at','Received']], required:['name','email','message']},
    admissions: {label:'Admissions enquiries', columns:[['full_name','Name'],['email','Email'],['phone','Phone'],['programme','Programme'],['education_level','Education'],['message','Message'],['status','Status'],['created_at','Received']], required:['full_name','email','programme']},
    career_applications: {label:'Career applications', columns:[['full_name','Name'],['email','Email'],['phone','Phone'],['role','Role'],['experience','Experience'],['cv_url','CV link'],['message','Message'],['status','Status'],['created_at','Received']], required:['full_name','email','role']},
    student_requests: {label:'Student requests', columns:[['full_name','Name'],['email','Email'],['student_number','Student number'],['request_type','Request type'],['message','Message'],['status','Status'],['created_at','Received']], required:['full_name','email','request_type']}
  };

  function initContentManager(userId) {
    const pageSelect=$('#page-select'), pageForm=$('#page-content-form'), pageFields=$('#page-content-fields'), resetBtn=$('#reset-page-copy');
    const tableSelect=$('#content-table'), form=$('#content-form'), list=$('#content-list'), status=$('[data-admin-status]');
    const defaults=window.PAGE_CONTENT_DEFAULTS||{}; let activeId=null, pageValues={};
    const BRAND_FIELDS=['logo_url','hero_image_url','icon_programs','icon_admissions','icon_resources','icon_mission','icon_vision','icon_values','icon_announcements','icon_student_forms','icon_student_support','icon_program_nursing','icon_program_lab','icon_program_community'];
    const ICON_FIELDS=[['icon_programs','Home: programmes'],['icon_admissions','Home: admissions'],['icon_resources','Home: student resources'],['icon_mission','About: mission'],['icon_vision','About: vision'],['icon_values','About: values'],['icon_announcements','Students: announcements'],['icon_student_forms','Students: forms & circulars'],['icon_student_support','Students: support'],['icon_program_nursing','Programme card: nursing'],['icon_program_lab','Programme card: laboratory'],['icon_program_community','Programme card: community health']];
    document.querySelectorAll('[data-tab]').forEach(btn=>btn.addEventListener('click',()=>{
      document.querySelectorAll('[data-tab]').forEach(x=>x.classList.toggle('active',x===btn));
      document.querySelectorAll('[data-panel]').forEach(x=>x.classList.toggle('hidden',x.dataset.panel!==btn.dataset.tab));
    }));
    async function loadPage() {
      const key=pageSelect.value; let saved={};
      const {data,error}=await sb.from('page_content').select('content').eq('page_key',key).maybeSingle();
      if(error){setStatus(status,`Could not load page content: ${error.message}`,true);}
      else saved=data?.content||{};
      pageValues={...(defaults[key]||{}),...saved};
      const entries=Object.entries(pageValues).filter(([field])=>key!=='site'||!BRAND_FIELDS.includes(field));
      pageFields.innerHTML=entries.length?entries.map(([field,value])=>`<div class="field ${String(value).length>95?'full':''}"><label for="page-${esc(field)}">${esc(labelize(field)+' — '+String(value).slice(0,58)+(String(value).length>58?'…':''))}</label>${String(value).length>95?`<textarea id="page-${esc(field)}" name="${esc(field)}" rows="4">${esc(value)}</textarea>`:`<input id="page-${esc(field)}" name="${esc(field)}" value="${esc(value)}" type="text">`}</div>`).join(''):'<p class="muted">No editable fields are configured for this page yet.</p>';
    }
    pageSelect?.addEventListener('change',loadPage);
    pageForm?.addEventListener('submit',async event=>{
      event.preventDefault(); const next={}; new FormData(pageForm).forEach((value,key)=>next[key]=String(value).trim());
      if(pageSelect.value==='site') BRAND_FIELDS.forEach(field=>{ if(pageValues[field]!==undefined) next[field]=pageValues[field]; });
      const {error}=await sb.from('page_content').upsert({page_key:pageSelect.value,content:next,updated_by:userId,updated_at:new Date().toISOString()},{onConflict:'page_key'});
      if(error){setStatus(status,`Could not save page: ${error.message}`,true);return;}
      pageValues=next;setStatus(status,'Page content saved. Refresh the public page to see the changes.');
    });
    resetBtn?.addEventListener('click',async()=>{
      if(!confirm('Restore this page to the original starter text? This replaces saved copy for this page.'))return;
      const {error}=await sb.from('page_content').delete().eq('page_key',pageSelect.value);
      if(error){setStatus(status,error.message,true);return;} await loadPage();setStatus(status,'Starter copy restored for the editor. Save the page if you want to store it in Supabase.');
    });

    const brandingForm=$('#branding-form'), iconFields=$('#brand-icon-fields'), logoUrlInput=$('#brand-logo-url'), logoFile=$('#brand-logo-file'), logoPreview=$('#brand-logo-preview'), heroUrlInput=$('#home-hero-url'), heroFile=$('#home-hero-file'), heroPreview=$('#home-hero-preview');
    function setLogoPreview(url){ if(logoPreview) logoPreview.src=url||'assets/school-logo.png'; }
    async function loadBranding(){
      const {data,error}=await sb.from('page_content').select('content').eq('page_key','site').maybeSingle();
      const values={...(defaults.site||{}),...(data?.content||{})};
      if(error) setStatus(status,`Could not load brand settings: ${error.message}`,true);
      if(logoUrlInput) logoUrlInput.value=values.logo_url||'assets/school-logo.png'; setLogoPreview(values.logo_url||'assets/school-logo.png');
      if(heroUrlInput) heroUrlInput.value=values.hero_image_url||''; if(heroPreview && values.hero_image_url){heroPreview.src=values.hero_image_url;heroPreview.hidden=false;}
      const previewName=$('#brand-preview-name'); if(previewName) previewName.textContent=values.school_name||'Premier Institute of Health Sciences Ltd';
      if(iconFields) iconFields.innerHTML=ICON_FIELDS.map(([key,label])=>`<div class="field icon-upload-card"><label for="${key}-file">${esc(label)}</label><img class="brand-icon-preview" id="${key}-preview" src="${esc(values[key]||'assets/school-logo.png')}" alt="${esc(label)} preview" onerror="this.style.display='none'"><input type="hidden" id="${key}" name="${key}" value="${esc(values[key]||'')}"><input id="${key}-file" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" data-icon-upload="${key}"><button type="button" class="btn btn-outline" data-icon-upload-button="${key}">Upload icon image</button><small class="muted">PNG, JPG, WebP or SVG · maximum 5 MB</small></div>`).join('');
    }
    $('#upload-home-hero')?.addEventListener('click',async()=>{
      const file=heroFile?.files?.[0]; if(!file){setStatus(status,'Choose a home page image first.',true);return;}
      if(!['image/png','image/jpeg','image/webp'].includes(file.type)){setStatus(status,'Choose a PNG, JPG or WebP image.',true);return;}
      if(file.size>10*1024*1024){setStatus(status,'Home page images must be 10 MB or smaller.',true);return;}
      const button=$('#upload-home-hero');button.disabled=true;button.textContent='Uploading…';
      try{const safeName=file.name.toLowerCase().replace(/[^a-z0-9._-]+/g,'-');const path=`branding/home-hero/${Date.now()}-${crypto.randomUUID()}-${safeName}`;const {error}=await sb.storage.from('school-resources').upload(path,file,{cacheControl:'3600',upsert:false,contentType:file.type});if(error)throw error;const {data}=sb.storage.from('school-resources').getPublicUrl(path);heroUrlInput.value=data.publicUrl;if(heroPreview){heroPreview.src=data.publicUrl;heroPreview.hidden=false;}setStatus(status,'Home page image uploaded. Click “Save branding & icons” to publish it.');}catch(error){setStatus(status,`Home page image upload failed: ${error.message||'check storage policies'}`,true);}finally{button.disabled=false;button.textContent='Upload home page image';}
    });
    logoUrlInput?.addEventListener('input',()=>setLogoPreview(logoUrlInput.value.trim()));
    $('#reset-brand-logo')?.addEventListener('click',()=>{logoUrlInput.value='assets/school-logo.png';setLogoPreview(logoUrlInput.value);});
    $('#upload-brand-logo')?.addEventListener('click',async()=>{
      const file=logoFile?.files?.[0]; if(!file){setStatus(status,'Choose a logo file first.',true);return;}
      if(!['image/png','image/jpeg','image/webp','image/svg+xml'].includes(file.type)){setStatus(status,'Choose a PNG, JPG, WebP or SVG logo.',true);return;}
      if(file.size>10*1024*1024){setStatus(status,'Logo files must be 10 MB or smaller.',true);return;}
      const button=$('#upload-brand-logo');button.disabled=true;button.textContent='Uploading…';
      try{const safeName=file.name.toLowerCase().replace(/[^a-z0-9._-]+/g,'-');const path=`branding/${Date.now()}-${crypto.randomUUID()}-${safeName}`;const {error}=await sb.storage.from('school-resources').upload(path,file,{cacheControl:'3600',upsert:false,contentType:file.type});if(error)throw error;const {data}=sb.storage.from('school-resources').getPublicUrl(path);logoUrlInput.value=data.publicUrl;setLogoPreview(data.publicUrl);setStatus(status,'Logo uploaded. Click “Save branding & icons” to publish it across the website.');}catch(error){setStatus(status,`Logo upload failed: ${error.message||'check storage policies'}`,true);}finally{button.disabled=false;button.textContent='Upload logo';}
    });
    iconFields?.addEventListener('click',async event=>{
      const button=event.target.closest('[data-icon-upload-button]'); if(!button)return;
      const key=button.dataset.iconUploadButton, fileInput=$(`[data-icon-upload="${key}"]`,iconFields), file=fileInput?.files?.[0];
      if(!file){setStatus(status,'Choose an icon image file first.',true);return;}
      if(!['image/png','image/jpeg','image/webp','image/svg+xml'].includes(file.type)){setStatus(status,'Choose a PNG, JPG, WebP or SVG image.',true);return;}
      if(file.size>5*1024*1024){setStatus(status,'Icon images must be 5 MB or smaller.',true);return;}
      button.disabled=true;button.textContent='Uploading…';
      try{const safeName=file.name.toLowerCase().replace(/[^a-z0-9._-]+/g,'-');const path=`branding/icons/${key}-${Date.now()}-${crypto.randomUUID()}-${safeName}`;const {error}=await sb.storage.from('school-resources').upload(path,file,{cacheControl:'3600',upsert:false,contentType:file.type});if(error)throw error;const {data}=sb.storage.from('school-resources').getPublicUrl(path);const valueInput=$(`#${key}`,iconFields),preview=$(`#${key}-preview`,iconFields);valueInput.value=data.publicUrl;preview.src=data.publicUrl;preview.style.display='block';setStatus(status,`${button.closest('.field').querySelector('label').textContent} uploaded. Click “Save branding & icons” to publish it.`);}catch(error){setStatus(status,`Icon upload failed: ${error.message||'check storage policies'}`,true);}finally{button.disabled=false;button.textContent='Upload icon image';}
    });

    brandingForm?.addEventListener('submit',async event=>{
      event.preventDefault();let current={...(defaults.site||{})};const {data,error:readError}=await sb.from('page_content').select('content').eq('page_key','site').maybeSingle();if(readError){setStatus(status,`Could not read current site settings: ${readError.message}`,true);return;}current={...current,...(data?.content||{})};
      const next={...current,logo_url:logoUrlInput.value.trim()||'assets/school-logo.png',hero_image_url:heroUrlInput?.value.trim()||''};new FormData(brandingForm).forEach((value,key)=>{if(key!=='logo_url')next[key]=String(value).trim();});
      const {error}=await sb.from('page_content').upsert({page_key:'site',content:next,updated_by:userId,updated_at:new Date().toISOString()},{onConflict:'page_key'});if(error){setStatus(status,`Could not save brand settings: ${error.message}`,true);return;}setLogoPreview(next.logo_url);setStatus(status,'Brand identity, home page image and icon settings saved. Refresh the public website to see the changes.');
    });
    loadBranding();

    function renderRecordFields(record={}) {
      const schema=TABLES[tableSelect.value]; activeId=record.id||null;
      form.innerHTML=schema.fields.map(([name,label,type,required,options])=>{
        const value=record[name]??(name==='is_published'?false:name==='sort_order'?0:'');
        let control='';
        if(type==='textarea')control=`<textarea name="${name}" rows="3" ${required?'required':''}>${esc(value)}</textarea>`;
        else if(type==='boolean')control=`<select name="${name}"><option value="false" ${String(value)!=='true'?'selected':''}>Draft / hidden</option><option value="true" ${String(value)==='true'?'selected':''}>Published / visible</option></select>`;
        else if(type==='select')control=`<select name="${name}" ${required?'required':''}><option value="">Choose…</option>${(options||[]).map(option=>`<option ${value===option?'selected':''}>${esc(option)}</option>`).join('')}</select>`;
        else control=`<input name="${name}" type="${type==='url'?'url':type==='date'?'date':type==='number'?'number':'text'}" value="${esc(value)}" ${required?'required':''} ${type==='number'?'step="1"':''}>`;
        const upload = ['file_url','image_url'].includes(name) ? `<div class="upload-row"><input type="file" data-upload-for="${name}" accept="${name==='image_url'?'image/jpeg,image/png,image/webp':'image/jpeg,image/png,image/webp,application/pdf'}"><button type="button" class="btn btn-outline" data-upload-button="${name}">Upload to Supabase</button></div><small class="muted">Uploads to the school-resources storage bucket.</small>` : '';
        return `<div class="field ${type==='textarea'?'full':''}"><label>${esc(label)}${required?' *':''}</label>${control}${upload}</div>`;
      }).join('')+`<div class="field full"><div class="actions"><button class="btn btn-dark" type="submit">${activeId?'Update record':'Save record'}</button><button class="btn btn-outline" type="button" id="clear-record">Clear form</button></div></div>`;
      $('#clear-record')?.addEventListener('click',()=>renderRecordFields());
      form.querySelectorAll('[data-upload-button]').forEach(button=>button.addEventListener('click',async()=>{
        const field=button.dataset.uploadButton, fileInput=form.querySelector(`[data-upload-for="${field}"]`), file=fileInput?.files?.[0];
        if(!file){setStatus(status,'Choose a file first.',true);return;}
        if(file.size>10*1024*1024){setStatus(status,'Files must be 10 MB or smaller.',true);return;}
        const safeName=file.name.toLowerCase().replace(/[^a-z0-9._-]+/g,'-'); const path=`${Date.now()}-${crypto.randomUUID()}-${safeName}`;
        button.disabled=true;button.textContent='Uploading…';
        try { const {error}=await sb.storage.from('school-resources').upload(path,file,{cacheControl:'3600',upsert:false,contentType:file.type}); if(error)throw error; const {data}=sb.storage.from('school-resources').getPublicUrl(path); const urlInput=form.querySelector(`[name="${field}"]`);if(urlInput)urlInput.value=data.publicUrl;setStatus(status,'Upload complete. Save the record to publish the link.'); } catch(error){setStatus(status,`Upload failed: ${error.message||'check storage policies'}`,true);} finally {button.disabled=false;button.textContent='Upload to Supabase';}
      }));
    }
    async function refreshRecords() {
      const table=tableSelect.value;list.innerHTML='<div class="empty">Loading records…</div>';
      const {data,error}=await sb.from(table).select('*').order('created_at',{ascending:false}).limit(100);
      if(error){list.innerHTML=`<div class="empty">${esc(error.message)}</div>`;return;}
      if(!data?.length){list.innerHTML='<div class="empty">No records yet. Use the form above to add the first item.</div>';return;}
      list.innerHTML=data.map(item=>`<article class="listing-item"><div class="record-summary"><h3>${esc(item.title||item.name||item.full_name||'Untitled record')}</h3><p>${esc(item.summary||item.description||item.body||item.caption||item.image_url||'')}</p><div class="record-meta"><span class="pill ${item.is_published?'pill-live':'pill-draft'}">${item.is_published?'Published':'Draft'}</span><small class="muted">${esc(item.created_at?new Date(item.created_at).toLocaleDateString():'')}</small></div></div><div class="record-actions"><button type="button" class="btn btn-outline" data-edit="${item.id}">Edit</button><button type="button" class="btn btn-danger" data-delete="${item.id}">Delete</button></div></article>`).join('');
      list.querySelectorAll('[data-edit]').forEach(button=>button.addEventListener('click',()=>{const item=data.find(row=>row.id===button.dataset.edit);renderRecordFields(item);form.scrollIntoView({behavior:'smooth',block:'center'});}));
      list.querySelectorAll('[data-delete]').forEach(button=>button.addEventListener('click',async()=>{if(!confirm('Delete this record permanently?'))return;const {error}=await sb.from(table).delete().eq('id',button.dataset.delete);if(error){setStatus(status,error.message,true);return;}setStatus(status,'Record deleted.');await refreshRecords();}));
    }
    tableSelect?.addEventListener('change',()=>{renderRecordFields();refreshRecords();});
    form?.addEventListener('submit',async event=>{
      event.preventDefault(); const payload={};
      new FormData(form).forEach((value,key)=>{const def=TABLES[tableSelect.value].fields.find(field=>field[0]===key);const type=def?.[2];payload[key]=type==='boolean'?value==='true':type==='number'?(value===''?0:Number(value)):String(value).trim()||null;});
      const query=activeId?sb.from(tableSelect.value).update(payload).eq('id',activeId):sb.from(tableSelect.value).insert(payload);
      const {error}=await query;
      if(error){setStatus(status,`Could not save record: ${error.message}`,true);return;}
      setStatus(status,activeId?'Record updated.':'Record created.');renderRecordFields();await refreshRecords();
    });
    $('#refresh-content')?.addEventListener('click',refreshRecords);
    loadPage();renderRecordFields();refreshRecords();
  }

  function initInquiries() {
    const select=$('#inquiry-table'), head=$('#inquiries-head'), body=$('#inquiries-body'), status=$('[data-admin-status]');
    async function load() {
      const table=select.value, schema=SUBMISSIONS[table]; head.innerHTML=`<tr>${schema.columns.map(([,label])=>`<th>${esc(label)}</th>`).join('')}<th>Action</th></tr>`;
      body.innerHTML='<tr><td colspan="12">Loading submissions…</td></tr>';
      const {data,error}=await sb.from(table).select('*').order('created_at',{ascending:false}).limit(200);
      if(error){body.innerHTML=`<tr><td colspan="12">${esc(error.message)}</td></tr>`;return;}
      if(!data?.length){body.innerHTML='<tr><td colspan="12">No submissions have been received.</td></tr>';return;}
      body.innerHTML=data.map(row=>`<tr>${schema.columns.map(([field])=>`<td>${field==='created_at'?esc(row[field]?new Date(row[field]).toLocaleString():''):field==='status'?`<select data-status-id="${row.id}" aria-label="Submission status"><option ${row.status==='new'?'selected':''}>new</option><option ${row.status==='in progress'?'selected':''}>in progress</option><option ${row.status==='responded'?'selected':''}>responded</option><option ${row.status==='closed'?'selected':''}>closed</option></select>`:field==='cv_url'&&row[field]?`<a href="${esc(row[field])}" target="_blank" rel="noopener">Open CV</a>`:esc(row[field]||'')}</td>`).join('')}<td><button type="button" class="btn btn-outline" data-delete-submission="${row.id}">Delete</button></td></tr>`).join('');
      body.querySelectorAll('[data-status-id]').forEach(input=>input.addEventListener('change',async()=>{const {error}=await sb.from(table).update({status:input.value}).eq('id',input.dataset.statusId);setStatus(status,error?error.message:'Submission status updated.',!!error);}));
      body.querySelectorAll('[data-delete-submission]').forEach(button=>button.addEventListener('click',async()=>{if(!confirm('Delete this submission permanently?'))return;const {error}=await sb.from(table).delete().eq('id',button.dataset.deleteSubmission);setStatus(status,error?error.message:'Submission deleted.',!!error);if(!error)load();}));
    }
    select.addEventListener('change',load);load();
  }
  function labelize(key) { return key.replace(/^text_/, 'Text ').replaceAll('_',' ').replace(/\b\w/g, char=>char.toUpperCase()); }
})();
