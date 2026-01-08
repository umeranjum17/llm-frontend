declare module "react-csv" {
  import * as React from "react";

  export type CsvData = unknown[] | string;

  export interface CSVLinkProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
    data: CsvData;
    headers?: unknown;
    filename?: string;
    separator?: string;
    enclosingCharacter?: string;
    uFEFF?: boolean;
    asyncOnClick?: boolean;
    onClick?: (event: React.MouseEvent<HTMLAnchorElement>, done: () => void) => void;
  }

  export const CSVLink: React.ForwardRefExoticComponent<CSVLinkProps & React.RefAttributes<HTMLAnchorElement>>;
  export const CSVDownload: React.ComponentType<unknown>;
}

