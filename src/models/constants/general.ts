export const getToken = (): string | undefined => 
    (window as any)?.__RYUU_SID__;