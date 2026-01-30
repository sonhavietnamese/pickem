'use client'

import PersonalInformation from '@/components/personal-information'
import Settings from '@/components/settings'
import { Masonry } from 'react-plock'
import Image from 'next/image'
import orangeTexture from '@/assets/textures/orange.png'
import blueTexture from '@/assets/textures/blue.png'

export default function Page() {
  return (
    <main className="bg-[#020204] w-screen h-screen p-4 flex gap-3 overflow-hidden">
      <div className="w-[340px] h-full border rounded-2xl gap-3 grid grid-rows-[1fr_auto]">
        <PersonalInformation />
        <Settings />
      </div>
      <div className="grid grid-cols-[1fr_320px] gap-3 w-full h-full">
        <section
          id="main"
          className="w-full h-full bg-[#1B1C20]/70 rounded-2xl p-5"
        >
          <div className="p-2 bg-[#1B1C20]/70 w-fit rounded-xl">
            <button className="text-white px-4 py-2 rounded-md bg-[#020204] font-bold">
              Discover
            </button>
            <button className="text-white/70 px-4 py-2 rounded-md bg-[#] font-bold">
              Yours
            </button>
          </div>

          <div className="mt-7 px-2">
            <section>
              <span className="text-white font-semibold text-2xl">
                Following Streamers
              </span>

              <ul className="w-full mt-5 space-x-3">
                <div className="w-full overflow-x-auto whitespace-nowrap flex gap-3">
                  {Array.from({ length: 3 }).map((_, index) => (
                    <li
                      key={index}
                      className="w-[340px] bg-[#1B1C20]/70 rounded-3xl p-5 inline-block align-top shrink-0"
                    >
                      <div className="w-full flex gap-4 items-center">
                        <div className="w-[80px] aspect-square rounded-2xl bg-white relative">
                          <div className="w-[20px] aspect-square rounded-full bg-red-500 absolute -bottom-1 -right-1 outline-4 outline-[#1B1C20]"></div>
                        </div>
                        <div className="flex flex-col leading-none">
                          <span className="text-white font-semibold text-xl">
                            sonhavietnamese
                          </span>
                          <span className="text-white/70 font-medium text-base">
                            Gaming - 2,456 viewers
                          </span>
                        </div>
                      </div>
                      <div className="text-white grid grid-cols-2 mt-6 px-1 pb-2">
                        <div className="flex flex-col">
                          <span className="text-white/70 font-medium text-base">
                            Running
                          </span>
                          <span className="text-white font-semibold text-3xl">
                            2
                          </span>
                        </div>
                        <div className="flex flex-col">
                          <span className="text-white/70 font-medium text-base">
                            Total Pot
                          </span>
                          <span className="text-white font-semibold text-3xl">
                            $2,300
                          </span>
                        </div>
                      </div>
                    </li>
                  ))}
                </div>
              </ul>
            </section>

            <section className="mt-10">
              <span className="text-white font-semibold text-2xl">
                Hottest Markets
              </span>
              <div className="mt-5 overflow-y-auto h-[calc(100vh-520px)] hide-scrollbar rounded-2xl">
                <Masonry
                  items={Array.from({ length: 20 }).map(
                    (_, index) =>
                      `https://picsum.photos/200/300?random=${index}`
                  )}
                  config={{
                    columns: 3,
                    gap: 12,
                  }}
                  render={(item, idx) => (
                    <div
                      key={idx}
                      className="bg-[#1B1C20]/70 rounded-2xl text-white overflow-hidden relative select-none cursor-pointer"
                    >
                      <figure className="w-full h-full absolute inset-0 z-0 after:content-[''] after:absolute after:inset-0 after:bg-linear-to-b after:from-black/80 after:to-transparent">
                        <Image
                          draggable={false}
                          src={
                            'https://static-cdn.jtvnw.net/previews-ttv/live_user_mande-960x540.jpg'
                          }
                          alt="Market"
                          width={960}
                          height={540}
                          className="w-full h-full object-cover"
                        />
                      </figure>
                      <div className="z-10 relative ">
                        <div className="w-full flex gap-4 items-center p-5">
                          <div className="w-[60px] aspect-square rounded-2xl relative">
                            <Image
                              src={
                                'https://static-cdn.jtvnw.net/jtv_user_pictures/6c5e7a4a-9c98-4d1d-a37c-ce47f6895e38-profile_image-70x70.png'
                              }
                              alt="Streamer"
                              width={60}
                              height={60}
                              className="rounded-2xl"
                            />
                          </div>
                          <div className="flex flex-col leading-none">
                            <span className="text-white font-semibold text-xl">
                              sonhavietnamese
                            </span>
                            <span className="text-white/70 font-medium text-base">
                              Gaming - 2,456 viewers
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="z-10 relative p-2 bg-[#1B1C20] mt-10">
                        <div className="w-full flex justify-between -mt-7">
                          <div className="grow">
                            <div className="px-2.5 select-none overflow-hidden rounded-[14px] w-fit py-1 flex items-center gap-1 relative bg-[#1B1C20]/20 backdrop-blur-md">
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
                                    strokeWidth="8"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                  />
                                  <path
                                    d="M56.5816 54.7906L42.7583 46.5443V28.772"
                                    stroke="white"
                                    strokeOpacity="0.68"
                                    strokeWidth="8"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                  />
                                </svg>
                              </figure>
                              <span className="text-white z-10 tabular-nums font-semibold text-xl">
                                04:52
                              </span>
                            </div>
                          </div>

                          <div className="bg-white backdrop-blur-md rounded-2xl px-4 py-2">
                            <span className="text-[#A9A9A9] font-medium text-2xl leading-none">
                              Pot:{' '}
                              <p className="font-bold inline-block text-[#F88D45]">
                                $2,300
                              </p>
                            </span>
                          </div>
                        </div>

                        <div className="p-3">
                          <span className="text-white font-semibold text-2xl mt-3">
                            Will this game win?
                          </span>

                          <div className="mt-3 grid grid-cols-[1fr_auto] grid-rows-2 gap-3 text-center items-center">
                            <div className="w-full h-[16px] rounded-full bg-[#38393d]">
                              <div className="w-[50%] h-full rounded-full overflow-hidden relative">
                                <Image
                                  draggable={false}
                                  src={orangeTexture}
                                  alt="Orange Texture"
                                  width={100}
                                  height={100}
                                  className=" w-full h-full object-cover z-0"
                                />
                              </div>
                            </div>
                            <div className="w-full">Yes</div>

                            <div className="w-full h-[16px] rounded-full bg-[#38393d]">
                              <div className="w-[50%] h-full rounded-full overflow-hidden relative">
                                <Image
                                  draggable={false}
                                  src={blueTexture}
                                  alt="Blue Texture"
                                  width={100}
                                  height={100}
                                  className=" w-full h-full object-cover z-0"
                                />
                              </div>
                            </div>
                            <div className="w-full">No</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                />
              </div>
            </section>
          </div>
        </section>
        <div className="w-full h-full border rounded-2xl flex flex-col gap-3">
          <section
            id="big-wins"
            className="w-full h-full bg-[#1B1C20]/70 rounded-2xl"
          ></section>
          <section
            id="chat"
            className="w-full h-full bg-[#1B1C20]/70 rounded-2xl"
          ></section>
        </div>
      </div>
    </main>
  )
}
