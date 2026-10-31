const fs = require('node:fs/promises');
const path = require('node:path');
module.exports = async context => {
  if (context.electronPlatformName !== 'win32') return;
  const ResEdit = await import('resedit');
  const PELibrary = await import('pe-library');
  const file = path.join(context.appOutDir, 'Jianmo Reader.exe');
  const exe = PELibrary.NtExecutable.from(await fs.readFile(file));
  const resource = PELibrary.NtExecutableResource.from(exe);
  const icon = ResEdit.Data.IconFile.from(await fs.readFile(path.join(context.packager.projectDir,'build/icon.ico')));
  const groups = ResEdit.Resource.IconGroupEntry.fromEntries(resource.entries);
  for (const group of groups) ResEdit.Resource.IconGroupEntry.replaceIconsForResource(resource.entries,group.id,group.lang,icon.icons.map(item=>item.data));
  for (const vi of ResEdit.Resource.VersionInfo.fromEntries(resource.entries)) {
    const version=context.packager.appInfo.version.split('.').map(Number);
    vi.setFileVersion(...version,0,1033);vi.setProductVersion(...version,0,1033);
    vi.setStringValues({lang:1033,codepage:1200},{FileDescription:'Jianmo Reader - 简墨 Markdown 编辑器',ProductName:'Jianmo Reader',InternalName:'Jianmo Reader',OriginalFilename:'Jianmo Reader.exe',CompanyName:'Jianmo Reader contributors',LegalCopyright:'Copyright © 2026 Jianmo Reader contributors'});
    vi.outputToResourceEntries(resource.entries);
  }
  resource.outputResource(exe);
  await fs.writeFile(file,Buffer.from(exe.generate()));
};
