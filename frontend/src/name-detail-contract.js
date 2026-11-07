const text=value=>typeof value==='string';
const texts=value=>Array.isArray(value)&&value.every(text);
export function validNameDetail(value) {
  if(!value || value.version!=='name-explanation-v1')return false;
  const source=value.source;
  if(!source || !['kind','label','summary','verification'].every(key=>text(source[key])) || !Array.isArray(source.citations))return false;
  if(!source.citations.every(c=>c&&['source_id','work','chapter','quote','sha256','version_label'].every(key=>text(c[key]))&&Number.isInteger(c.line)&&c.line>0&&texts(c.selected_characters)))return false;
  if(!['benefits','considerations'].every(key=>Array.isArray(value[key])&&value[key].every(row=>row&&['id','title','text'].every(field=>text(row[field])))))return false;
  if(!Array.isArray(value.characters)||!value.characters.every(g=>g&&text(g.char)&&['meaning','radical','element','classification','day_master_relation'].every(key=>g[key]==null||text(g[key]))&&(g.kangxi_strokes==null||Number.isInteger(g.kangxi_strokes))))return false;
  if(!value.reading||!['pinyin','tone_pattern','note'].every(key=>text(value.reading[key])))return false;
  if(!value.fit||!['mode','label','explanation','basis'].every(key=>text(value.fit[key]))||!texts(value.fit.secondary)||(value.fit.direction!=null&&!text(value.fit.direction)))return false;
  if(!value.elements||!['generation_cycle','control_cycle','method','usage'].every(key=>text(value.elements[key]))||!Array.isArray(value.elements.pairs))return false;
  if(!value.elements.pairs.every(row=>row&&['from','to','kind','label','text'].every(key=>text(row[key]))))return false;
  return !!value.birthplace&&typeof value.birthplace.applied==='boolean'&&['explanation','note'].every(key=>text(value.birthplace[key]))&&text(value.reference_note);
}
