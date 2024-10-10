import React, { version as ReactVersion } from 'react';

export default {
  '(react) typeof React': typeof React,
  '(react) typeof React.cloneElement': typeof React.cloneElement,
  '(react) reactVersionsMatch': React.version === ReactVersion,
};
