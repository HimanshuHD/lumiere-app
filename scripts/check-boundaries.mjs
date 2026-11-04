import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
const normalize = value => value.split(path.sep).join('/');
function featureRoot(file) {
  const parts=file.split('/');if(parts[0]!=='src'||parts[1]!=='features')return null;
  return parts.slice(0,parts[2]==='reader'?4:3).join('/');
}
export function checkBoundaries(root) {
  const src=path.join(root,'src');const files=[];
  function walk(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const full=path.join(dir,entry.name);if(entry.isDirectory())walk(full);else if(/\.[cm]?[jt]sx?$/.test(entry.name))files.push(full);}}
  walk(src);const issues=[];const graph=new Map();
  const exceptionFile=path.join(root,'scripts/architecture-exceptions.json');
  const exceptions=fs.existsSync(exceptionFile)?JSON.parse(fs.readFileSync(exceptionFile,'utf8')):[];
  const usedExceptions=new Set();
  const options={moduleResolution:ts.ModuleResolutionKind.Bundler,module:ts.ModuleKind.ESNext,baseUrl:root,paths:{'@/*':['src/*']},allowImportingTsExtensions:true};
  for(const file of files){
    const from=normalize(path.relative(root,file)),edges=[];
    const source=ts.createSourceFile(file,fs.readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true);
    const check=(specifier,typeOnly=false)=>{
      const resolved=ts.resolveModuleName(specifier,file,options,ts.sys).resolvedModule?.resolvedFileName;
      const target=resolved?normalize(path.relative(root,resolved)):null;
      const report=message=>issues.push(`${from}: ${message} (${specifier})`);
      const domain=from.startsWith('src/domain/');const infrastructure=from.startsWith('src/infrastructure/');
      if(domain&&(!target||!target.startsWith('src/domain/')))report('domain contracts must depend only on domain contracts');
      if((specifier.startsWith('@supabase/')||target==='src/infrastructure/supabase/client.ts')&&!infrastructure)report('Supabase integration imports belong only in infrastructure');
      if(target?.startsWith('src/')&&from.startsWith('src/shared/ui/')&&!target.startsWith('src/shared/')&&!target.startsWith('src/domain/'))report('shared UI cannot depend on application/feature/persistence code');
      if(target&&infrastructure&&/^src\/(app|components|context|hooks|features)\//.test(target))report('infrastructure cannot depend on feature state, UI, or composition');
      if(target?.startsWith('src/infrastructure/')&&/^src\/(components|context|hooks|features)\//.test(from)){
        const match=exceptions.find(e=>e.from===from&&e.to===target&&e.issue&&e.removeWhen);
        if(match)usedExceptions.add(match);else report('feature/UI persistence integration requires a controller port or tracked migration exception');
      }
      if(/^src\/features\/reader\/(pdf|epub|text)\//.test(from)&&target&&(/^src\/(app|infrastructure)\//.test(target)||target==='src/hooks/useData.ts'||target.startsWith('src/features/reader/progress/')))report('reader engines report events and cannot own persistence');
      if(target?.startsWith('supabase/'))report('backend-only modules cannot enter the browser graph');
      const feature=target&&featureRoot(target),own=featureRoot(from);
      if(feature&&feature!==own&&!target.endsWith('/index.ts'))report('use the feature public entry point');
      if(target?.startsWith('src/')&&!typeOnly)edges.push(target);
    };
    const visit=node=>{
      if(ts.isImportDeclaration(node)&&ts.isStringLiteral(node.moduleSpecifier)){
        const clause=node.importClause;
        const only=clause?.isTypeOnly||(clause?.namedBindings&&ts.isNamedImports(clause.namedBindings)&&!clause.name&&clause.namedBindings.elements.length>0&&clause.namedBindings.elements.every(e=>e.isTypeOnly));
        check(node.moduleSpecifier.text,!!only);
      }
      if(ts.isExportDeclaration(node)&&node.moduleSpecifier&&ts.isStringLiteral(node.moduleSpecifier))check(node.moduleSpecifier.text,node.isTypeOnly);
      if(ts.isCallExpression(node)&&node.arguments.length&&ts.isStringLiteral(node.arguments[0])&&(node.expression.kind===ts.SyntaxKind.ImportKeyword||node.expression.getText(source)==='require'))check(node.arguments[0].text);
      if(ts.isImportTypeNode(node)&&ts.isLiteralTypeNode(node.argument)&&ts.isStringLiteral(node.argument.literal))check(node.argument.literal.text,true);
      ts.forEachChild(node,visit);
    };visit(source);graph.set(from,edges);
  }
  const active=new Set(),done=new Set(),stack=[];
  function visit(file){if(active.has(file)){issues.push('runtime dependency cycle: '+[...stack.slice(stack.indexOf(file)),file].join(' -> '));return;}if(done.has(file))return;active.add(file);stack.push(file);for(const next of graph.get(file)||[])visit(next);stack.pop();active.delete(file);done.add(file);}
  for(const file of graph.keys())visit(file);
  for(const entry of exceptions)if(!usedExceptions.has(entry))issues.push(`stale migration exception: ${entry.from} -> ${entry.to}`);
  return [...new Set(issues)];
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');const issues=checkBoundaries(root);
  if(issues.length){process.stderr.write(issues.join('\n')+'\n');process.exitCode=1;}else process.stdout.write('Architecture boundaries and runtime dependency graph pass.\n');
}
