"use client";
import { themes,type ThemeId } from "@/themes/themes";
import styles from "./Settings.module.css";
export function ThemeSelector({value,onChange}:{value:ThemeId;onChange:(theme:ThemeId)=>void}) {
 return <fieldset className={styles.themes}><legend>Theme</legend>{themes.map(theme=><label key={theme.id} className={styles.choice} style={{background:theme.background,color:theme.text,borderColor:theme.paperBorder}}>
  <input type="radio" name="diary-theme" value={theme.id} checked={value===theme.id} onChange={()=>onChange(theme.id)}/>{theme.name}
 </label>)}</fieldset>;
}
