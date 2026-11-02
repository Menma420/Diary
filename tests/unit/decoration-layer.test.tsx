import { render,fireEvent } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect,it,vi } from "vitest";
import { DecorationLayer } from "@/components/diary/DecorationLayer";
import { parseCalendarDate } from "@/lib/dates";
vi.mock("@/components/diary/DiarySession",()=>({useDiarySession:()=>({decorationScope:`w1_${"a".repeat(43)}`,theme:"sakura-pink"})}));
const date=parseCalendarDate("2026-10-31")!;
it("server markup and browser rendering select the identical versioned arrangement",()=>{
 const html=renderToStaticMarkup(<DecorationLayer date={date}/>);
 const server=new DOMParser().parseFromString(html,"text/html").querySelector('[data-artwork]')!;
 const {container,rerender}=render(<DecorationLayer date={date}/>);const layer=container.querySelector('[data-artwork]')!;
 expect(layer.getAttribute('data-arrangement')).toBe(server.getAttribute('data-arrangement'));
 rerender(<DecorationLayer date={date}/>);expect(container.querySelector('[data-artwork]')).toBe(layer);
 expect(layer).toHaveAttribute('aria-hidden','true');for(const image of layer.querySelectorAll('img'))expect(image).toHaveAttribute('alt','');
});
it("failed image loading hides only that illustration while retaining its reserved box and arrangement",()=>{
 const {container}=render(<DecorationLayer date={date}/>);const layer=container.querySelector('[data-artwork]')!,card=layer.firstElementChild!,before=layer.getAttribute('data-arrangement');
 fireEvent.error(card.querySelector('img')!);expect(card).toHaveAttribute('data-failed','true');expect(card).toHaveStyle({visibility:'hidden'});
 expect(layer.children).toHaveLength(4);expect(layer.getAttribute('data-arrangement')).toBe(before);
 expect(layer.children[1]).not.toHaveAttribute('data-failed');
});
