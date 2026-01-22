'use client'

import progressBarThumb from '@/assets/elements/progess-bar-thumb.png'
import blueTexture from '@/assets/textures/blue.png'
import greenTexture from '@/assets/textures/green.png'
import orangeTexture from '@/assets/textures/orange.png'
import { Squircle } from '@squircle-js/react'
import Image from 'next/image'
import { motion } from 'motion/react'
import { useEffect, useState } from 'react'

export default function PageClient() {
  const [percentYes, setPercentYes] = useState(80)
  const [percentNo, setPercentNo] = useState(20)

  useEffect(() => {
    const increasePercent = (side: 'yes' | 'no') => {
      if (side === 'yes') {
        setPercentYes(percentYes + 1)
      } else {
        setPercentNo(percentNo + 1)
      }
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowUp') {
        increasePercent('yes')
      } else if (event.key === 'ArrowDown') {
        increasePercent('no')
      }
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [percentYes, percentNo])

  return (
    <main className="w-screen h-screen flex items-center justify-center font-sans select-none">
      <section className="w-[500px]">
        <Squircle
          cornerRadius={58}
          cornerSmoothing={1}
          className="bg-white w-full h-full p-6 px-7 border-4 border-[#DEDEDE]"
        >
          <div className="text-black text-[22px] flex flex-wrap gap-0.5 w-full">
            <span className="grow text-[20px]">
              Will livestream get 100 views after
            </span>
            <div className="grow">
              <div className="px-2.5 select-none overflow-hidden rounded-[14px] w-fit py-0 flex items-center gap-1 relative">
                <figure className="w-6 aspect-square inline-block z-10">
                  <svg
                    width="88"
                    height="88"
                    viewBox="0 0 88 88"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    className="w-full h-full"
                  >
                    <path
                      fillRule="evenodd"
                      clipRule="evenodd"
                      d="M77.9159 44.0016C77.9159 62.7346 62.7322 77.9183 43.9992 77.9183C25.2662 77.9183 10.0825 62.7346 10.0825 44.0016C10.0825 25.2686 25.2662 10.085 43.9992 10.085C62.7322 10.085 77.9159 25.2686 77.9159 44.0016Z"
                      stroke="white"
                      strokeOpacity="0.68"
                      strokeWidth="10.5075"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M56.5816 54.7906L42.7583 46.5443V28.772"
                      stroke="white"
                      strokeOpacity="0.68"
                      strokeWidth="10.5075"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </figure>
                <span className="text-white z-10 tabular-nums">04:52</span>

                <Image
                  draggable={false}
                  src={greenTexture}
                  alt="Green Texture"
                  width={100}
                  height={100}
                  className="absolute top-0 left-0 w-full h-full object-cover z-0"
                />
              </div>
            </div>
          </div>

          <div className="w-full h-full mt-3 flex flex-col gap-1">
            <div className="grid grid-cols-[1fr_120px] items-center justify-between w-full">
              <div className="w-fit flex items-center justify-center h-full">
                <figure className="w-full h-full relative">
                  <div
                    id="thumb"
                    className="w-full h-[40px] flex items-center justify-center"
                  >
                    <Image draggable={false} src={progressBarThumb} alt="" />
                    <div className="w-full h-full progress-bar-mask absolute top-0 left-0">
                      <motion.div
                        animate={{
                          width: `${percentYes}%`,
                        }}
                        transition={{
                          duration: 0.25,
                          ease: 'easeInOut',
                        }}
                        className="h-full overflow-hidden"
                      >
                        <Image draggable={false} src={orangeTexture} alt="" />
                      </motion.div>
                    </div>
                  </div>
                </figure>
              </div>

              <div className="w-full h-full justify-end flex items-center">
                <motion.div
                  key={percentYes}
                  animate={{
                    scale: [1.15, 1],
                  }}
                  transition={{
                    duration: 0.5,
                    type: 'spring',
                    bounce: 0.5,
                  }}
                  className="flex gap-2 p-2 items-center bg-[#F6F6F6] rounded-2xl px-3 w-fit relative"
                >
                  <figure className="w-full h-full absolute top-0 left-0">
                    <svg
                      width="420"
                      height="160"
                      viewBox="0 0 428 160"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                      className="w-full h-full"
                    >
                      <path
                        d="M4 59C4 28.6243 28.6243 4 59 4H362C391.823 4 416 28.1766 416 58V98C416 130.033 390.033 156 358 156H57C27.7289 156 4 132.271 4 103V59Z"
                        stroke="#F88D45"
                        strokeWidth="12"
                        strokeLinecap="round"
                        strokeDasharray="27 27"
                      />
                    </svg>
                  </figure>

                  <span className="leading-none mt-0.5">Yes</span>
                  <div className="w-full py-1 px-1 rounded-[8px] pt-1.5 bg-[#EDEDED] flex items-center justify-center text-[#7D7D7D] text-[11px] leading-none ">
                    100%
                  </div>
                </motion.div>
              </div>
            </div>

            <div className="grid grid-cols-[1fr_120px] items-center justify-between w-full">
              <div className="w-fit flex items-center justify-center h-full">
                <figure className="w-full h-full relative">
                  <div
                    id="thumb"
                    className="w-full h-[40px] flex items-center justify-center"
                  >
                    <Image draggable={false} src={progressBarThumb} alt="" />
                    <div className="w-full h-full progress-bar-mask absolute top-0 left-0">
                      <motion.div
                        className="h-full overflow-hidden"
                        animate={{
                          width: `${percentNo}%`,
                        }}
                        transition={{
                          duration: 0.25,
                          ease: 'easeInOut',
                        }}
                      >
                        <Image draggable={false} src={blueTexture} alt="" />
                      </motion.div>
                    </div>
                  </div>
                </figure>
              </div>

              <div className="w-full h-full justify-end flex items-center">
                <motion.div
                  key={percentNo}
                  animate={{
                    scale: [1.15, 1],
                  }}
                  transition={{
                    duration: 0.5,
                    type: 'spring',
                    bounce: 0.5,
                  }}
                  className="flex gap-2 p-2 items-center bg-[#F6F6F6] rounded-2xl px-3 w-fit relative"
                >
                  <figure className="w-full h-full absolute top-0 left-0">
                    <svg
                      width="420"
                      height="160"
                      viewBox="0 0 428 160"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                      className="w-full h-full"
                    >
                      <path
                        d="M4 59C4 28.6243 28.6243 4 59 4H362C391.823 4 416 28.1766 416 58V98C416 130.033 390.033 156 358 156H57C27.7289 156 4 132.271 4 103V59Z"
                        stroke="#2C9FF2"
                        strokeWidth="12"
                        strokeLinecap="round"
                        strokeDasharray="27 27"
                      />
                    </svg>
                  </figure>

                  <span className="leading-none mt-0.5">No</span>
                  <div className="w-full py-1 px-1 rounded-[8px] pt-1.5 bg-[#EDEDED] flex items-center justify-center text-[#7D7D7D] text-[11px] leading-none ">
                    20%
                  </div>
                </motion.div>
              </div>
            </div>
          </div>
        </Squircle>
      </section>
    </main>
  )
}
