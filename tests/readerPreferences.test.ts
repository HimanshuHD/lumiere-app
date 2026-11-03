import {test} from 'node:test';import assert from 'node:assert/strict';
import {parseReaderSettings} from '../src/domain/reader-preferences.ts';
import {parseCatalogFeed} from '../src/domain/catalog.ts';
test('preferences validate individual persisted values and discard unknown properties',()=>{
 assert.deepEqual(parseReaderSettings({theme:'unknown',fontSize:'large',lineSpacing:'invalid',unexpected:true}),{theme:'light',fontSize:'large',lineSpacing:'comfortable'});
 assert.deepEqual(parseReaderSettings(null),{theme:'light',fontSize:'medium',lineSpacing:'comfortable'});
 assert.deepEqual(parseReaderSettings({theme:'dark',fontSize:'small',lineSpacing:'compact'}),{theme:'dark',fontSize:'small',lineSpacing:'compact'});
});
test('catalog response parsing rejects malformed envelopes before presentation',()=>{
 assert.throws(()=>parseCatalogFeed({books:'broken'}),/invalid book list/);assert.throws(()=>parseCatalogFeed({books:[null]}),/invalid book/);
 const feed=parseCatalogFeed({title:'Books',books:[{title:'One',categories:['Fiction',5]}]});assert.equal(feed.books[0].author,'');assert.deepEqual(feed.books[0].categories,['Fiction']);assert.equal(feed.count,1);
});
