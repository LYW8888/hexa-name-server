import React from 'react';
import { Theme } from '@radix-ui/themes';
import '@radix-ui/themes/styles.css';

export default function DesignSystem({children, admin=false}) {
  return <Theme appearance="light" accentColor="jade" grayColor="sage" radius="large"
    panelBackground="translucent" scaling="100%" hasBackground={false}
    className={admin ? 'origin-theme admin-theme' : 'origin-theme product-theme'}>
    {children}
  </Theme>;
}
