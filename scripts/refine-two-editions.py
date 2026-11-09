from pathlib import Path

def replace(file, old, new):
 p=Path(file);s=p.read_text()
 if old in s:p.write_text(s.replace(old,new))
 elif new not in s:raise RuntimeError('Expected source contract changed: '+file)

replace('src/workshop-state.js',"/^[a-zA-Z0-9_-]{1,120}$/.test(id)","/^[\\p{L}\\p{N}_-]{1,120}$/u.test(id)")
replace('scripts/build-public-data.mjs',"if(!/^[a-zA-Z0-9_./-]+$/.test(file)||file.includes('..'))throw Error('Bad export path');", "if(typeof file!=='string'||!/^[\\p{L}\\p{N}_./-]+$/u.test(file)||file.includes('..')||file.startsWith('/'))throw Error('Bad export path: '+file);")
replace('src/public-shell.html','href="https://kosmodrom.space"','href="https://kosmodrom.space"')
print('EDITION_IDENTIFIERS_VALIDATED')
