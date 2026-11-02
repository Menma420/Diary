import {fireEvent,render,screen} from '@testing-library/react';
import {expect,it,vi} from 'vitest';
import {ThemeSelector} from '@/components/settings/ThemeSelector';
import {SettingsDialog} from '@/components/settings/SettingsDialog';
vi.mock('@/components/diary/DiarySession',()=>({useDiarySession:()=>({preferences:null,theme:'sakura-pink',setTheme:vi.fn(),timeZone:'Asia/Kolkata',active:true})}));
it('named previews mark the selected radio and send only the approved theme identity',()=>{
 const change=vi.fn();render(<ThemeSelector value="dreamy-sky" onChange={change}/>);
 expect(screen.getByRole('radio',{name:'Dreamy Sky'})).toBeChecked();expect(screen.getAllByRole('radio')).toHaveLength(4);
 fireEvent.click(screen.getByRole('radio',{name:'Vintage Journal'}));expect(change).toHaveBeenCalledWith('vintage-journal');
});
it('settings dialog exposes labels and validates IANA inputs without changing the editor',()=>{
 HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};
 HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');this.dispatchEvent(new Event('close'));};
 render(<SettingsDialog/>);fireEvent.click(screen.getByRole('button',{name:'Settings'}));
 expect(screen.getByRole('dialog',{name:'Appearance and timezone'})).toBeVisible();fireEvent.change(screen.getByLabelText('IANA timezone'),{target:{value:'Invalid/Zone'}});fireEvent.click(screen.getByRole('button',{name:'Apply timezone'}));
 expect(screen.getByRole('alert')).toHaveTextContent('valid IANA');fireEvent.click(screen.getByRole('button',{name:'Close settings'}));expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});
