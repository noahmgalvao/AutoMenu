import { useLayoutEffect, useRef, useState, type ImgHTMLAttributes } from 'react';

export function PhotoLoading({ blocking = false }: { blocking?: boolean }) {
    return <span role="status" aria-label="Carregando imagem" data-print-control="true"
        className={`absolute inset-0 z-30 grid place-items-center rounded-[inherit] bg-slate-900/35 ${blocking ? 'pointer-events-auto' : 'pointer-events-none'}`}>
        <span className="size-5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
    </span>;
}

export function MenuPhoto({ showLoading, src, ...props }: ImgHTMLAttributes<HTMLImageElement> & { showLoading: boolean }) {
    const image = useRef<HTMLImageElement>(null);
    const [finished, setFinished] = useState<string>();
    useLayoutEffect(() => {
        if (image.current?.complete) setFinished(src);
    }, [src]);
    return <>
        <img {...props} ref={image} src={src} onLoad={event => {
            setFinished(src);
            props.onLoad?.(event);
        }} onError={event => {
            setFinished(src);
            props.onError?.(event);
        }} />
        {showLoading && finished !== src && <PhotoLoading />}
    </>;
}
