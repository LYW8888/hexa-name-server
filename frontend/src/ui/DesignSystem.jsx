import React from 'react';
import { Theme } from '@radix-ui/themes';
import '@radix-ui/themes/styles.css';
import './celestial-art.css';
import './dream-theme.css';
import DreamSky from './DreamSky.jsx';

export default function DesignSystem({children, admin=false}) {
  return <Theme appearance="light" accentColor="iris" grayColor="slate" radius="large"
    panelBackground="translucent" scaling="100%" hasBackground={false}
    className={admin ? 'origin-theme dream-theme admin-theme' : 'origin-theme dream-theme product-theme'}>
    <DreamSky/>{children}
  </Theme>;
}
