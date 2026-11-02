import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { DECORATION_MANIFEST } from '../src/lib/decoration-manifest.ts';
// Original AI-assisted vector code authored for Dear Diary Phase 8, CC0-1.0.
// No tracing, downloads, fonts, raster payloads or external art references.
const drawings = {
'sakura-blossom-v1':'<path d="M48 31C29 4 13 26 29 41 3 42 14 68 34 59 29 85 57 87 60 63 81 78 94 52 69 43 90 25 63 9 56 31Z" fill="#F6C8D8"/><circle cx="48" cy="47" r="13" fill="#FFF0C7"/><path d="M43 46h1m8 0h1m-9 7q4 3 8 0" fill="none"/>',
'sakura-bunny-v1':'<path d="M32 43C18 10 31 5 42 37M48 36C47 3 64 8 59 44" fill="#F6CDD9"/><ellipse cx="48" cy="60" rx="27" ry="23" fill="#FFF8EF"/><path d="M34 55h1m23 0h1m-15 6 4 3 4-3m-4 3v5m0-1q-5 4-8 0m8 0q5 4 8 0" fill="none"/><g fill="#F4CAD7" stroke="none"><ellipse cx="32" cy="64" rx="5" ry="3"/><ellipse cx="64" cy="64" rx="5" ry="3"/></g>',
'sakura-berry-v1':'<path d="M48 29C10 10 17 58 48 82 79 58 86 10 48 29Z" fill="#EFA9BD"/><path d="m48 32-16-9 5-9 10 10 9-14 2 15 14-4-7 13-17-2Z" fill="#BFD9C6"/><path d="M33 42v3m18-5v3m13 3v3M36 55v3m17-3v3m-6 10v3" stroke="#FFF4D5" stroke-width="2.5"/>',
'sakura-hearts-v1':'<path d="M56 44C35 15 15 48 53 77 94 53 80 19 56 44Z" fill="#EDB6CD"/><path d="M27 23C13 4 0 26 25 43 52 27 42 5 27 23Z" fill="#F7D6E1" transform="translate(7 4)"/><path d="m76 14 2 7 7 2-7 2-2 7-2-7-7-2 7-2ZM22 63l2 5 5 2-5 2-2 5-2-5-5-2 5-2Z" fill="#F4E2B0"/>',
'sky-cloud-v1':'<path d="M24 68C5 66 8 42 27 42 22 19 57 14 62 38 84 26 97 60 76 67Z" fill="#E0F1F3"/><path d="M33 51h1m24 0h1m-19 7q5 4 10 0" fill="none"/><path d="m24 76-3 6m27-6-3 6m27-6-3 6" stroke="#A5CDD7"/>',
'sky-moon-v1':'<path d="M63 14C22 11 7 60 43 79 64 90 86 76 87 59 53 75 31 38 63 14Z" fill="#F8EBC6"/><path d="m70 17 3 8 8 3-8 3-3 8-3-8-8-3 8-3ZM17 20l2 4 4 2-4 2-2 4-2-4-4-2 4-2Z" fill="#CBE8EF"/>',
'sky-kite-v1':'<path d="m49 12 27 28-28 28-24-29Z" fill="#C7E4EF"/><path d="m49 12-1 56M24 39l52 1M48 68c-16 5 14 14-3 20" fill="none"/><path d="m43 76-8-5 1 9Zm6 6 8-5-1 9Z" fill="#F1D9DE"/>',
'sky-stars-v1':'<path d="m47 13 9 22 24 2-18 16 6 24-21-13-21 13 5-24-18-16 24-2Z" fill="#F8E9BF"/><path d="m77 14 3 6 6 3-6 3-3 6-3-6-6-3 6-3ZM17 67l2 6 6 2-6 2-2 6-2-6-6-2 6-2Z" fill="#C4E3EA"/><path d="M40 46h1m12 0h1m-12 9q5 4 10 0" fill="none"/>',
'lavender-sprig-v1':'<path d="M45 82 51 24M46 67 29 48m19 6 18-16" fill="none" stroke="#7E9887"/><path d="M46 76C25 77 22 63 24 61c13-1 21 8 22 15Zm1-11c20 0 25-12 22-15-13 0-20 7-22 15Z" fill="#C9DCCD" stroke="#7E9887"/><g fill="#C8B6DF"><ellipse cx="51" cy="23" rx="7" ry="10"/><ellipse cx="44" cy="35" rx="7" ry="9"/><ellipse cx="57" cy="37" rx="7" ry="9"/><ellipse cx="29" cy="46" rx="7" ry="9"/><ellipse cx="67" cy="36" rx="7" ry="9"/></g>',
'lavender-moth-v1':'<path d="M45 43C16 7 3 40 31 53 5 60 22 88 47 61M51 43C80 7 93 40 65 53 91 60 74 88 49 61" fill="#D9CAEC"/><path d="M48 39v28m-1-28-7-10m9 10 7-10" fill="none"/><circle cx="27" cy="40" r="6" fill="#F5E1EC"/><circle cx="69" cy="40" r="6" fill="#F5E1EC"/><path d="M30 64h6m24 0h6" fill="none"/>',
'lavender-cup-v1':'<path d="M66 42h8c18 0 16 22-2 22h-7" fill="none" stroke-width="3"/><path d="M19 39h50v22c0 26-50 26-50 0Z" fill="#E1D4EC"/><path d="M15 82h63M32 28c-10-9 10-11 0-20m17 20c-10-9 10-11 0-20" fill="none"/><path d="M44 52c-10-13-21 3 0 17 21-14 10-30 0-17Z" fill="#F7E4EC"/>',
'lavender-orbit-v1':'<circle cx="48" cy="48" r="23" fill="#D9CCEA"/><ellipse cx="48" cy="49" rx="39" ry="11" transform="rotate(-27 48 49)" fill="none" stroke-width="3"/><path d="m73 11 2 6 6 2-6 2-2 6-2-6-6-2 6-2ZM21 70l2 5 5 2-5 2-2 5-2-5-5-2 5-2Z" fill="#F5E6BE"/>',
'vintage-book-v1':'<path d="M13 24c14-6 25-4 35 3 10-7 21-9 35-3v52c-13-5-24-3-35 4-11-7-22-9-35-4Z" fill="#F3E8D1"/><path d="M48 27v53M22 37q9-2 17 2m-17 9q9-2 17 2m-17 9q9-2 17 2m18-24q9-4 17-2m-17 13q9-4 17-2m-17 13q9-4 17-2" fill="none"/><path d="M62 22v26l6-6 6 3V21" fill="#BFC9AD"/>',
'vintage-leaf-v1':'<path d="M24 77C5 45 36 17 78 14 84 55 56 87 24 77Z" fill="#C9D2B4"/><path d="m19 84 51-57M34 67l-5-21m16 9-1-24m1 25 23-2M34 67l23 1" fill="none"/><path d="m77 70 2 5 5 2-5 2-2 5-2-5-5-2 5-2Z" fill="#E9D6AE"/>',
'vintage-letter-v1':'<rect x="13" y="25" width="70" height="51" rx="5" fill="#F1E4CA"/><path d="m15 28 33 26 33-26M15 73l25-23m41 23L56 50" fill="none"/><circle cx="48" cy="54" r="10" fill="#CEA58C"/><path d="M48 49c-6-8-13 2 0 11 13-9 6-19 0-11Z" fill="#F7E8D0"/><path d="M28 15h17m-9-6h17" fill="none"/>',
'vintage-teapot-v1':'<path d="M66 44c24-14 26 27 4 21" fill="none" stroke-width="4"/><path d="M27 40 12 32l7 26 12 6" fill="#D6DDC7"/><path d="M31 36c-16 22-13 45 19 45s36-23 19-45Z" fill="#D6DDC7"/><path d="M28 36h44l-10-8H38Zm15-8v-8h13v8" fill="#EEDDBD"/><path d="M51 48v20m0-10c-12 0-13-9-13-9 10-1 13 9 13 9Zm0 7c12 0 13-9 13-9-10-1-13 9-13 9Z" fill="#B4C2A1"/>'
};
const strokes = {'sakura-pink':'#A66D86','dreamy-sky':'#709BA9','lavender-dreams':'#9180AD','vintage-journal':'#998268'};
if(process.argv.includes('--write')) await mkdir('public/decorations/v1',{recursive:true});
for(const asset of DECORATION_MANIFEST.assets){
 const body=drawings[asset.id];if(!body)throw Error('Missing original drawing');
 const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96"><g stroke="${strokes[asset.themes[0]]}" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">${body}</g></svg>\n`;
 const path=`public${asset.path}`;
 if(process.argv.includes('--write'))await writeFile(path,svg);else if(await readFile(path,'utf8')!==svg)throw Error(`Original drawing output differs: ${asset.id}`);
}
console.log(`Original SVG sources match ${DECORATION_MANIFEST.assets.length} optimized local drawings.`);
