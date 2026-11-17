import {tr} from "../../i18n/translate";
import {useLocale} from "../../i18n/react";
import React from 'react';
import {Screen,Card,Copy} from '../../ui/design';
export default function HealthProfileScreen(){
  useLocale();return <Screen><Card><Copy title>{tr("Health profile")}</Copy><Copy>{tr("Health profile editing is not available yet. Your account information is available under Profile.")}</Copy></Card></Screen>;}
