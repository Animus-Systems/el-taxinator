/**
 * Compatibility shim for next/image.
 *
 * Replaces Next.js <Image> with a plain <img> tag.
 * Supports the common props: src, alt, width, height, className.
 */
import React from "react"

interface ImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  src: string
  alt: string
  width?: number
  height?: number
  priority?: boolean
  quality?: number
  fill?: boolean
  placeholder?: string
  blurDataURL?: string
  unoptimized?: boolean
}

function Image({ src, alt, width, height, className, priority, quality, fill, placeholder, blurDataURL, unoptimized, ...rest }: ImageProps) {
  const style: React.CSSProperties = fill
    ? { position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", ...rest.style }
    : rest.style || {}

  return (
    <img
      src={src}
      alt={alt}
      width={width}
      height={height}
      className={className}
      style={style}
      loading={priority ? "eager" : "lazy"}
      {...rest}
    />
  )
}

export default Image
