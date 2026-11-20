import { useLayoutEffect, useRef, useState, type ImgHTMLAttributes } from 'react';

export function PhotoLoading({ blocking = false }: { blocking?: boolean }) {
    return <span role="status" aria-label="Carregando imagem" data-print-control="true"
        className={`absolute inset-0 z-30 grid place-items-center rounded-[inherit] bg-slate-900/35 ${blocking ? 'pointer-events-auto' : 'pointer-events-none'}`}>
        <span className="size-5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
    </span>;
}

function updateAspect(image: HTMLImageElement) {
    const frame = image.closest<HTMLElement>('[data-auto-photo-ratio]');
    if (image.complete && image.naturalWidth && image.naturalHeight) {
        frame?.style.setProperty('--automenu-photo-aspect', String(image.naturalWidth / image.naturalHeight));
    } else frame?.style.removeProperty('--automenu-photo-aspect');
}

export function MenuPhoto({ showLoading, src, ...props }: ImgHTMLAttributes<HTMLImageElement> & { showLoading: boolean }) {
    const image = useRef<HTMLImageElement>(null);
    const [finished, setFinished] = useState<string>();
    useLayoutEffect(() => {
        if (image.current) updateAspect(image.current);
        if (image.current?.complete) setFinished(src);
    }, [src]);
    return <>
        <img {...props} ref={image} src={src} onLoad={event => {
            updateAspect(event.currentTarget);
            setFinished(src);
            props.onLoad?.(event);
        }} onError={event => {
            setFinished(src);
            props.onError?.(event);
        }} />
        {showLoading && finished !== src && <PhotoLoading />}
    </>;
}
